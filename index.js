const core = require('@actions/core');
const github = require('@actions/github');
const fetch = require('node-fetch');

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

const headers = {
  'robocloud-process-secret': core.getInput('process-secret'),
  'Content-Type': 'application/json',
};

async function triggerRobot() {
  const payload = core.getInput('payload');
  const body = payload && payload.length ? JSON.parse(payload) : {};
  const response = await fetch(core.getInput('process-url'), { method: 'POST', body: JSON.stringify({ variables: body }), headers });
  const json = await response.json();

  if (json.message !== 'OK') {
    throw Error(`Failed to start process - ${JSON.stringify(json)}`);
  }

  const { workspaceId, processId, processRunId } = json;

  console.log(`Process ${processId} triggered`);

  return `https://api.eu1.robocloud.eu/workspace-v1/workspaces/${workspaceId}/processes/${processId}/runs/${processRunId}`;
}

async function waitForRobot(processUrl) {
  const timeout = +core.getInput('timeout') * 1000;
  const endTime = new Date().getTime() + timeout;

  let attempt = 1;

  while (new Date().getTime() < endTime) {
    try {
      const response = await fetch(processUrl, { headers });
      const json = await response.json();

      if (json.state === 'COMPL') {
        if (json.result === 'ERR') {
          console.log(`Robot failed with an error`);
          return false;
        }

        console.log('Robot completed succesfully', JSON.stringify(json));
        return true;
      }

      if (json.errorCode && json.errorCode.length) {
        console.log(`Robot failed with error code ${json.errorCode}.`);
        return false;
      }

      if (json.state === 'IP') {
        console.log(`Robot still running. Attempt ${attempt++}.`);
      }

      if (json.state === 'INI' || json.state === 'IND') {
        console.log(`Robot initializing. Attempt ${attempt++}.`);
      }
    } catch (e) {
      console.log(e);
    }
    await sleep(4);
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
