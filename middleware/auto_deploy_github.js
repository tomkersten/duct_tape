export function GithubAutoDeploy(options) {
  let {config} = options;
  let log;

  if(!options.logger) {
    throw new Error("`logger` parameter missing from GithubAutoDeploy registration options.");
  }
  else {
    log = options.logger.child({componentName: 'GithubAutoDeploy'});
  }

  if(!config) {
    throw new Error('No config for GithubAutoDeploy.');
  }


  if(!config.defaultTriggerDeployment) {
    log.warn('No `defaultTriggerDeployment` option set! Each repository will require a `triggerDeployment` function to be defined.');
  }

  if(!config.repositories || Object.keys(config.repositories).length == 0) {
    log.warn('No repositories are configured. No automatic Github deployments will occur.');
  }
  else {
    log.info(`Listening for updates from the following Github repositories: ${Object.keys(config.repositories).join(', ')}`);
  }


  return async (ctx, next) => {
    ctx.status = 200;
    ctx.res.end('Ok'); // sender should get 200. always. problems are on our end.


    let repositoryName = ctx.request.body.repository.full_name;
    let action = ctx.request.body.action;
    let rel = ctx.request.body && ctx.request.body.release;
    let repoConfig = config.repositories[repositoryName];

    if(!repoConfig) {
      log.warn({action}, `Middleware activated, but does not appear to be a tracked repository. Verify the 'githubAutoSync' key in the server config or your Github webhook settings for the "${repositoryName}" repository.`);
      return Promise.resolve();
    }

    let deployable = action === "published" ? shouldDeploy(repoConfig, rel) : false;
    let triggerDeployment = repoConfig.triggerDeployment || config.defaultTriggerDeployment;
    let triggerDeploymentArgs = repoConfig.triggerDeploymentArgs
      || config.triggerDeploymentArgs
      || {};



    return new Promise((resolve, reject) => {
      if(deployable && !triggerDeployment) {
        log.warn(`Middleware activated and it looks like a deployable release for "${repoConfig.name}", but there is no triggerDeployment action defined. Skipping deployment.`);
      }
      else if(deployable) {
        log.debug(`Middleware activated and it looks like a deployable release for "${repoConfig.name}". Triggering deployment.`);

        let triggerLogger = log.child({componentName: `${repoConfig.name}DeploymentLogger`});

        triggerDeployment(triggerDeploymentArgs, rel, triggerLogger);
      }
      else {
        log.debug({action}, "Middleware activated but does not appear to qualify for deployment.");
      }

      resolve();
    })
    .then(results => {
      if(options.afterUpdate) options.afterUpdate();

      log.debug('Completed successfully.')
    })
    .catch((err) => {
      log.error({err: err}, 'Unexpected error when attempting to run middleware');
      throw err;
    });
  };

  function shouldDeploy(repoConfig, relInfo) {
    return !isPrerelease(relInfo) ||
      (isPrerelease(relInfo) && deployingPrereleases(repoConfig));
  }

  function isPrerelease(relInfo) {
    return relInfo && relInfo.prerelease;
  }

  function deployingPrereleases(repoConfig) {
    return repoConfig && repoConfig.deployPrereleases === true;
  }
}
