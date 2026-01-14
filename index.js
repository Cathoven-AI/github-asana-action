const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

async function run() {
  try {
    const pat = core.getInput('asana-pat');

    core.info(`Event: ${github.context.eventName}, Action: ${github.context.payload.action}`);
    
    // Get the pull request from the context
    const pullRequest = github.context.payload.pull_request;

    if (!pullRequest) {
      core.info('No pull request found in context. This action only runs on pull_request events.');
      return;
    }

    core.info(`PR #${pullRequest.number}: "${pullRequest.title}"`);
    core.info(`Target branch: ${pullRequest.base.ref}, Merged: ${pullRequest.merged}`);

    // Only close Asana tasks when PR is merged to main
    if (pullRequest.base.ref !== 'main' && pullRequest.base.ref !== 'master') {
      core.info(`PR target branch is "${pullRequest.base.ref}", not "main" or "master". Skipping.`);
      return;
    }

    if (!pullRequest.merged) {
      core.info('Pull request was closed but not merged. Skipping Asana task completion.');
      return;
    }

    core.info('PR was merged to main or master. Proceeding to close Asana tasks...');

    const body = pullRequest.body;
    if (!body) {
      core.info('Pull request has no description. Skipping.');
      return;
    }

    // Regex to find Asana task URLs
    // Matches: https://app.asana.com/0/PROJECT_ID/TASK_ID
    // Example: https://app.asana.com/0/0/1212717167783596
    const regex = /https:\/\/app\.asana\.com\/0\/\d+\/(\d+)/g;
    const taskIds = new Set();

    const matches = body.matchAll(regex);
    for (const match of matches) {
      taskIds.add(match[1]);
    }

    if (taskIds.size === 0) {
      core.info('No Asana task URLs found in PR description.');
      return;
    }

    core.info(`Found ${taskIds.size} unique Asana task(s): ${Array.from(taskIds).join(', ')}`);

    for (const taskId of taskIds) {
      try {
        core.info(`Closing Asana task: ${taskId}...`);
        await axios.put(
          `https://app.asana.com/api/1.0/tasks/${taskId}`,
          { data: { completed: true } },
          {
            headers: {
              Authorization: `Bearer ${pat}`,
              'Content-Type': 'application/json',
            },
          }
        );
        core.info(`Successfully closed task ${taskId}`);
      } catch (error) {
        core.error(`Failed to close task ${taskId}: ${error.message}`);
        if (error.response) {
            core.error(`Asana API Response: ${JSON.stringify(error.response.data)}`);
        }
        // We don't fail the entire action if one task fails, but we could if strict mode was desired.
        // For now, we just log the error.
      }
    }

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
