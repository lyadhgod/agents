declare const lyag: {
    printUsage: (usage?: string) => void;
    runMainOperations: (projectPath?: string, outputRoot?: string) => Promise<void>;
    parseCli: (argv?: string[]) => {
        projectPath: string;
        outputRoot: string;
    };
    usageText: string;
};

export = lyag;
