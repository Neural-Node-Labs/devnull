# Planning

## Devide the work in multiple phases where each phase will have isolated re act memory 
- done
## Each of this phase work on same artifact or code and inter defendent task. 
- done
## The objective is the smaller the memory footprint to lessen the token. instead of having big memory/context of all info that not use by task.
- done
## In each phase and their is need for reset Max Iteration ask the user
- done

## Each task report summary will be stored in tasks/task_history.md and database both from UI and CLI
- new
## Each phase report will be stored in tasks/[task_name].md and will be used for next phase to continue the work.
- new
## Each Phase report will contain total token (highlighted in red if above 1 million, green above 500m, blue below 500m) and number of iteration (red above 100, green above 50, blue below 20) highlighted in UI and CLI
## Make phase-planning as default and --single-phase as optional
## Add capability to continue task create a wbs tasks/[task_name]-wbs.md on each task and update as per phase is completed , create same storage in database for UI.