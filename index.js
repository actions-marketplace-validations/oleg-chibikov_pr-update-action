const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const baseTokenRegex = new RegExp('%basebranch%', "g");
    const headTokenRegex = new RegExp('%headbranch%', "g");

    const inputs = {
      token: core.getInput('repo-token', {required: true}),
      baseBranchRegex: core.getInput('base-branch-regex'),
      headBranchRegex: core.getInput('head-branch-regex'),
      runConditionRegex: core.getInput('run-condition-regex'),
      skipConditionRegex: core.getInput('skip-condition-regex'),
      removeRunConditionMatch: (core.getInput('remove-run-condition-match').toLowerCase() === 'true'),
      removeBranchNameFromTitle: (core.getInput('remove-branch-name-from-title').toLowerCase() === 'true'),
      lowercaseBranch: (core.getInput('lowercase-branch').toLowerCase() === 'true'),
      titleTemplate: core.getInput('title-template'),
      titleUpdateAction: core.getInput('title-update-action').toLowerCase(),
      titleInsertSpace: (core.getInput('title-insert-space').toLowerCase() === 'true'),
      titleUppercaseBaseMatch: (core.getInput('title-uppercase-base-match').toLowerCase() === 'true'),
      titleUppercaseHeadMatch: (core.getInput('title-uppercase-head-match').toLowerCase() === 'true'),
      bodyTemplate: core.getInput('body-template'),
      bodyUpdateAction: core.getInput('body-update-action').toLowerCase(),
      bodyNewlineCount: parseInt(core.getInput('body-newline-count')),
      bodyUppercaseBaseMatch: (core.getInput('body-uppercase-base-match').toLowerCase() === 'true'),
      bodyUppercaseHeadMatch: (core.getInput('body-uppercase-head-match').toLowerCase() === 'true'),
    }

    let title = github.context.payload.pull_request.title || '';

    const runConditionRegexString = inputs.runConditionRegex.trim();
    const runConditionRegex = runConditionRegexString.length ? new RegExp(runConditionRegexString, 'i'): null;

    const skipConditionRegexString = inputs.skipConditionRegex.trim();
    const skipConditionRegex = skipConditionRegexString.length ? new RegExp(skipConditionRegexString, 'i'): null;

    if (runConditionRegex) {
      const shouldRun = title.match(runConditionRegex);
      if (!shouldRun) {
        core.info(`RunConditionRegex: '${runConditionRegexString}': '${title}' processing should be skipped`);
        return;
      }
      else if (inputs.removeRunConditionMatch) {
        const oldTitle = title;
        title = title.replace(runConditionRegex, '')
        core.info(`Removed run condition match: '${runConditionRegexString}' from '${oldTitle}'. New title: '${title}'`);
      }
    }

    if (skipConditionRegex) {
      const shouldSkip = title.match(skipConditionRegex);
      if (shouldSkip) {
        core.info(`SkipConditionRegex: '${skipConditionRegexString}': '${title}' processing should be skipped`);
        return;
      }
    }

    const baseBranchRegex = inputs.baseBranchRegex.trim();
    const matchBaseBranch = baseBranchRegex.length > 0;

    const headBranchRegex = inputs.headBranchRegex.trim();
    const matchHeadBranch = headBranchRegex.length > 0;

    if (!matchBaseBranch && !matchHeadBranch) {
      core.setFailed('No branch regex values have been specified');
      return;
    }

    const matches = {
      baseMatch: '',
      headMatch: '',
    }

    const removeBranchNameFromTitle = (branchName) => {
      if (inputs.removeBranchNameFromTitle){
        const branchNameRegex = new RegExp('[ \t]*(?:' + branchName + '|' + branchName.replace('-','') + '|' + branchName.replace('-',' ') + ')[ \t]*', 'i');
        if (title.match(branchNameRegex))
        {
          const oldTitle = title;
          title = title.replace(branchNameRegex, '')
          core.info(`Removed '${branchName}' from '${oldTitle}'. New title: '${title}'`);
        }
        else {
          core.info(`'${branchName}' isn't specified in '${title}'. Leaving it intact`);
        }
      }
    }

    if (matchBaseBranch) {
      const baseBranchName = github.context.payload.pull_request.base.ref;
      const baseBranch = inputs.lowercaseBranch ? baseBranchName.toLowerCase() : baseBranchName;
      core.info(`Base branch: ${baseBranch}`);

      const baseMatches = baseBranch.match(new RegExp(baseBranchRegex));
      if (!baseMatches) {
        core.setFailed('Base branch name does not match given regex');
        return;
      }

      matches.baseMatch = baseMatches[0];
      core.info(`Matched base branch text: ${matches.baseMatch}`);

      removeBranchNameFromTitle(matches.baseMatch);

      core.setOutput('baseMatch', matches.baseMatch);
    }

    if (matchHeadBranch) {
      const headBranchName = github.context.payload.pull_request.head.ref;
      const headBranch = inputs.lowercaseBranch ? headBranchName.toLowerCase() : headBranchName;
      core.info(`Head branch: ${headBranch}`);

      const headMatches = headBranch.match(new RegExp(headBranchRegex));
      if (!headMatches) {
        core.setFailed('Head branch name does not match given regex');
        return;
      }

      matches.headMatch = headMatches[0];
      core.info(`Matched head branch text: ${matches.headMatch}`);

      removeBranchNameFromTitle(matches.headMatch);

      core.setOutput('headMatch', matches.headMatch);
    }

    const capitalizeFirstLetter = (string) => {
      return string.charAt(0).toUpperCase() + string.slice(1);
    }

    title = capitalizeFirstLetter(title);

    const request = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: github.context.payload.pull_request.number,
    }

    const upperCase = (upperCase, text) => upperCase ? text.toUpperCase() : text;

    const processedTitleText = inputs.titleTemplate
      .replace(baseTokenRegex, upperCase(inputs.titleUppercaseBaseMatch, matches.baseMatch))
      .replace(headTokenRegex, upperCase(inputs.titleUppercaseHeadMatch, matches.headMatch));
    core.info(`Processed title text: ${processedTitleText}`);

    const updateTitle = ({
      prefix: !title.toLowerCase().startsWith(processedTitleText.toLowerCase()),
      suffix: !title.toLowerCase().endsWith(processedTitleText.toLowerCase()),
      replace: title.toLowerCase() !== processedTitleText.toLowerCase(),
    })[inputs.titleUpdateAction] || false;

    core.setOutput('titleUpdated', updateTitle.toString());

    if (updateTitle) {
      request.title = ({
        prefix: processedTitleText.concat(inputs.titleInsertSpace ? ' ': '', title),
        suffix: title.concat(inputs.titleInsertSpace ? ' ': '', processedTitleText),
        replace: processedTitleText,
      })[inputs.titleUpdateAction];
      core.info(`New title: ${request.title}`);
    } else {
      core.warning('No updates were made to PR title');
    }

    const body = github.context.payload.pull_request.body || '';
    const processedBodyText = inputs.bodyTemplate
      .replace(baseTokenRegex, upperCase(inputs.bodyUppercaseBaseMatch, matches.baseMatch))
      .replace(headTokenRegex, upperCase(inputs.bodyUppercaseHeadMatch, matches.headMatch));
    core.info(`Processed body text: ${processedBodyText}`);

    const updateBody = ({
      prefix: !body.toLowerCase().startsWith(processedBodyText.toLowerCase()),
      suffix: !body.toLowerCase().endsWith(processedBodyText.toLowerCase()),
      replace: body.toLowerCase() !== processedBodyText.toLowerCase(),
    })[inputs.bodyUpdateAction] || false;

    core.setOutput('bodyUpdated', updateBody.toString());

    if (updateBody) {
      request.body = ({
        prefix: processedBodyText.concat('\n'.repeat(inputs.bodyNewlineCount), body),
        suffix: body.concat('\n'.repeat(inputs.bodyNewlineCount), processedBodyText),
        replace: processedBodyText,
      })[inputs.bodyUpdateAction];
      core.debug(`New body: ${request.body}`);
    } else {
      core.warning('No updates were made to PR body');
    }

    if (!updateTitle && !updateBody) {
      return;
    }

    const octokit = github.getOctokit(inputs.token);
    const response = await octokit.pulls.update(request);

    core.info(`Response: ${response.status}`);
    if (response.status !== 200) {
      core.error('Updating the pull request has failed');
    }
  }
  catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

run()
