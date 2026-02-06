# Guidelines

- Any change made to any one of the scripts under ./scripts dir (except help.txt) must also reflect to every other script with type of changes. As the primary changing file and all other files are in the same dir, this might cause race-condition. To avoid race-condition always change the *lyag.sh* file first and then change the other files other than *lyag.sh* file and never listen to changes to any of the files other than *lyag.sh*.
