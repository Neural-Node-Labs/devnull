Enhancement on UI
1. For UI use postgres to Telemetry log
2. Optimize the log where thought is shown only and when click will open the entire detail.
3. I need to be able to identify which log execute belong to which task (task id) and when the task id to show task detail. for this we need task history in postgres
4. In log detail Make the Json format prettify as if it is in IDE (colored) and formated.
5. Project information will also be put in postgres
6. for log file which is used by CLI is there a way to limit the size to *.log to 2 mb if exceed it bill be save as *_[date].log and create new log
7. The Plan when UI is used it will be save in postgres and LLM will manage the task status from postgres-
- new tools to save the plan - > API endpoint to save it to postgres
- new tools to update status, add task or delete task
8. UI new pages to show the Plan.
