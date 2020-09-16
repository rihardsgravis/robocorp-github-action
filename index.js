const core = require('@actions/core');
const github = require('@actions/github');
const fetch = require('node-fetch');

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

const headers = {
  headers: {
    'robocloud-process-secret': `Bearer ${core.getInput('process-secret')}`,
    'Content-Type': 'application/json',
  },
};

async function triggerRobot() {
  const payload = core.getInput('payload');
  console.log(payload);
  const body = payload && payload.length ? JSON.parse(payload) : {};
  const response = await fetch(core.getInput('process-url'), { method: 'POST', body, headers });
  const json = await response.json();

  if (json.message !== 'OK') {
    throw Error('Failed to start process');
  }

  const { workspaceId, processId, processRunId } = json;

  return `https://api.eu1.robocloud.eu/workspace-v1/workspaces/${workspaceId}/processes/${processId}/runs/${processRunId}`;
}

async function waitForRobot(processUrl) {
  const timeout = +core.getInput('timeout') * 1000;
  const endTime = new Date().getTime() + timeout;

  let attempt = 1;

  while (new Date().getTime() < endTime) {
    try {
      const response = await fetch(processUrl, { method: 'POST', headers });
      const json = await response.json();

      if (json.state === 'COMPL') {
        return true;
      }

      if (json.errorCode.length) {
        return false;
      }

      console.log(`Robot still running. Attempt ${attempt++}. ${JSON.stringify(json)}`);
    } catch (e) {
      await sleep(2);
    }
  }

  throw new Error(`Timeout reached before the robot completed`);
}

(async () => {
  try {
    const processUrl = await triggerRobot();
    const response = await waitForRobot(processUrl);

    if (!response) {
      core.setFailed('Robot failed to execute');
    }
  } catch (err) {
    core.setFailed(err.message);
  }
})();
