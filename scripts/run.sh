#!/bin/sh
set -eu

script_dir=$(cd "$(dirname "$0")" && pwd)
root_dir=$(cd "$script_dir/.." && pwd)
deps_file="$root_dir/deps.yml"
rules_dir="$root_dir/rules"
start_dir=$(pwd)

# Ensure deps.yml and rules/ are present next to the script.
if [ ! -f "$deps_file" ]; then
    echo "deps.yml not found at $deps_file"
    exit 1
fi

if [ ! -d "$rules_dir" ]; then
    echo "rules folder not found at $rules_dir"
    exit 1
fi

# Parse CLI options for source/output (default: current directory).
project_path="."
output_root=""
while [ $# -gt 0 ]; do
    case "$1" in
        -s|--source)
            project_path=${2:-}
            shift 2
            ;;
        -o|--output)
            output_root=${2:-}
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [-s|--source <path>] [-o|--output <path>]"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [-s|--source <path>] [-o|--output <path>]"
            exit 1
            ;;
    esac
done

case "$project_path" in
    ~|~/*) project_path="$HOME${project_path#~}" ;;
esac

case "$project_path" in
    /*) ;;
    *) project_path="$start_dir/$project_path" ;;
esac

if [ -n "$output_root" ]; then
    case "$output_root" in
        ~|~/*) output_root="$HOME${output_root#~}" ;;
    esac
    case "$output_root" in
        /*) ;;
        *) output_root="$start_dir/$output_root" ;;
    esac
fi

if ! project_path=$(cd "$project_path" 2>/dev/null && pwd); then
    echo "Project doesn't exist."
    exit 1
fi

if [ ! -d "$project_path" ]; then
    echo "Project doesn't exist."
    exit 1
fi

if [ ! -r "$project_path" ]; then
    echo "No read permission for project folder."
    exit 1
fi

# Parse deps.yml into extension/dependency maps, then scan the project and compute the full
# dependency closure in one awk pass.
selected_langs=$(find "$project_path" -type f -exec sh -c '
    for path do
        base=${path##*/}
        case "$base" in
            *.*) ext=${base##*.}; printf "%s\n" "$ext" ;;
        esac
    done
' sh {} + | awk -v depsfile="$deps_file" '
    function add_lang(lang) {
        if (!(lang in selected)) {
            selected[lang] = 1
            queue[++qtail] = lang
        }
    }
    BEGIN {
        while ((getline line < depsfile) > 0) {
            sub(/\r$/, "", line)
            if (line ~ /^[A-Za-z0-9-]+:/) {
                key = line
                sub(/:.*/, "", key)
                section = ""
                continue
            }
            if (line ~ /^[[:space:]]{4}ext:/) { section = "ext"; continue }
            if (line ~ /^[[:space:]]{4}deps:/) { section = "deps"; continue }
            if (section == "ext" && line ~ /^[[:space:]]{8}-[[:space:]]/) {
                ext = line
                sub(/^[[:space:]]{8}-[[:space:]]/, "", ext)
                ext_map[tolower(ext)] = ext_map[tolower(ext)] " " key
                continue
            }
            if (section == "deps" && line ~ /^[[:space:]]{8}[A-Za-z0-9-]+:/) {
                dep = line
                sub(/^[[:space:]]{8}/, "", dep)
                sub(/:.*/, "", dep)
                deps_map[key] = deps_map[key] " " dep
                continue
            }
        }
        close(depsfile)
        qhead = 1
        qtail = 0
    }
    {
        ext = tolower($0)
        if (ext in ext_map) {
            n = split(ext_map[ext], langs, " ")
            for (i = 1; i <= n; i++) {
                if (langs[i] != "") {
                    add_lang(langs[i])
                }
            }
        }
    }
    END {
        while (qhead <= qtail) {
            lang = queue[qhead++]
            n = split(deps_map[lang], deps, " ")
            for (i = 1; i <= n; i++) {
                if (deps[i] != "") {
                    add_lang(deps[i])
                }
            }
        }
        for (lang in selected) {
            print lang
        }
    }
' | sort -u)

if [ -z "$selected_langs" ]; then
    echo "No matching file types found in $project_path."
    exit 0
fi

# Collect every distinct filename present in the selected rules folders.
if [ -z "$output_root" ]; then
    output_root="$project_path"
else
    if ! mkdir -p "$output_root"; then
        echo "Unable to create output path."
        exit 1
    fi
    if ! output_root=$(cd "$output_root" 2>/dev/null && pwd); then
        echo "Output path doesn't exist."
        exit 1
    fi
fi

output_dir="$output_root"
mkdir -p "$output_dir"

file_list=$(for lang in $selected_langs; do
    src_dir="$rules_dir/$lang"
    if [ -d "$src_dir" ] && [ -r "$src_dir" ]; then
        find "$src_dir" -maxdepth 1 -type f -exec sh -c '
            for rule_file do
                base=${rule_file##*/}
                printf "%s\n" "$base"
            done
        ' sh {} +
    fi
done | sort -u)

# For each filename, concatenate same-named files across languages into one output file.
for filename in $file_list; do
    [ -z "$filename" ] && continue
    out_file="$output_dir/$filename"
    : > "$out_file"

    for lang in $selected_langs; do
        [ -z "$lang" ] && continue
        src_dir="$rules_dir/$lang"
        rule_file="$src_dir/$filename"
        if [ -r "$rule_file" ]; then
            cat "$rule_file" >> "$out_file"
            printf "\n\n" >> "$out_file"
        fi
    done
done

echo "Generated rule bundles in $output_dir"
