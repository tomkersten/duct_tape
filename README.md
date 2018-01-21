# Duct Tape

# The Problem

You have some containers you'd like to deploy to your own server, but don't have
the time, need, or inclination to set up fancy orchestration services on that
host machine. Yet, you'd like to do _some_ operations that the container itself
can't provide, such as automatically deploying some code when a new release is
created.

Duct Tape is a naive approach to solving that problem.

# How this works

There are "integrations" (currently only one for Github) that listen for events and
respond to them. This application is deployed as a container itself and expects
to have a directory from the host server mounted as a volume at
`/opt/app/shared_volume`.

In the configuration, you configure the triggers to carry out some action when
triggered. For example, the `GithubAutoDeploy` integration listens for Github
release web hooks for the specified repositories and then executes the
associated trigger.

# How I use it

I have a DigitalOcean server. I want to deploy small personal projects to it.
I register "Release" webhooks to point to this application and have it
touch/create a file for the associated application on the mounted volume.

Then, to automatically "deploy" a new version of the applications, I use
`inotifywait` on the host machine listen to the directory for application
deployment notifications...and re-run `docker-compose up --build` for it.

# Is this safe?

Although I don't see obvious issues with the general approach offhand for
small personal projects, there are probably many ways it could be abused.

So, use at your own risk and all that.

---

# An example...

I have naming convention for deployed applications on my server and for
how to start them with Docker Compose. Assume the following:

```
/path/to/applications_dir/
|- app1/
   |- bin/
      |- deploy
   |- docker-compose.yml
   |- ...
|- app2/
   |- bin/
      |- deploy
   |- docker-compose.yml
   |- ...
|- app3/
   |- bin/
      |- deploy
   |- docker-compose.yml
   |- ...
```

To start or update any application, I can run the `bin/deploy` script
inside the "application's directory"...and it will take care of whatever
is necessary.

## The Duct Tape app

So, the instance of Duct Tape I have running has this structure:

```
|- duct-tape.domainnamehere.com/
   |- docker-compose.yml
   |- bin/
      |- deploy
      |- deployContainers
      |- listen
   |- config
      |- app_config.js
   |- shared_volume
   |- ...
```

- The `bin/deploy` script is, again, whatever is necessary to start the app
  correctly (basically, it executes a `docker-compose` command, in this case).
- The `bin/listen` script executes a `nohup`ed `inotifywait` command to watch
  the `shared_volume` directory and execute the `bin/deployContainers` script
  with the name of the application to deploy as an argument.
  For example, executing `bin/deployContainers duct-tape.domainnamehere.com`
  would update/deploy itself).


### `config/app_config.js`

The application config for my setup defines a simple global trigger that writes
maps the Github repository to an application/directory name on my server and writes
a file with that mapped name (ie: `release` webhooks from `tomkersten/duct_tape`
write a file named `duct-tape-domain.some-domain.com` into the mounted
`shared_volume` directory. I pass in the file name to write in each repository
configuration entry.

```
export default function AppConfig(env) {
  let config = {
    production: {
      githubAutoSync: {
        defaultTriggerDeployment: (options, rel, logger) => {
          logger.info('Triggering from global config action');

          if(!options.fileName) {
            logger.warn("No fileName set in triggerDeploymentArgs (/options). Skipping deployment trigger.");
          }
          else {
            let filePath = path.resolve(path.basename(__filename), '..', 'shared_volume', options.fileName);

            logger.debug(`Writing ${filePath} to trigger deployment.`);

            fs.closeSync(fs.openSync(filePath, 'w'));
          }
        },
        repositories: {
          'tomkersten/duct_tape': {
            name: 'duct-tape.domainnamehere.com',
            triggerDeploymentArgs: {
              fileName: 'duct-tape.domainnamehere.com'
            } //, deployPrereleases: true, <-- if you want those deployed...
          }
        }
      }
    }
  };

  return config[env];
};
```

### `bin/listen`

Now that we know which application(s) need to be updated/deployed, we just need
to have a way for the "host" to detect and execute the appropriate `bin/deploy`
script.

For that, I'm using `inotifywait`, which monitors that `shared_volume`
directory (on the "host" machine), and executes a simple shell script,passing
in the application to deploy.

> **Note:** You will need to [install `inotify`](https://stackpointer.io/unix/linux-monitor-file-system-changes/397/)
to use this "as-is"...

The following command starts this "listener" process and executes the
`duct-tape-app-dir/bin/deployContainers` script:

```
#!/bin/bash

# Get the parent directory this script is stored in, regardless of where
# it was called from...
SRC_DIR=$(cd "$(dirname "$0")/.."; pwd)


# Now monitor it (in the background) for creations or modifications of files...
nohup inotifywait -mrq -e create \
            -e modify \
            $SRC_DIR/shared_volume/ |\
while read file;
do
  # When a creation/modification occurs, execute `bin/deployContainers`,
  # passing in the name of the file that was created/modified...
  echo $file | $SRC_DIR/bin/deployContainers `cut -d ' ' -f 3`
done >> $SRC_DIR/listen_activity.log 2>&1 &

echo "Listening for deployment notifications..."
```

> **Note:** All output will be logged to `syslog`.

The `bin/deployContainers` script looks like this:

```
#!/bin/bash

APPS_PATH=/some/directory/with/apps
FILE=$1

# If a `deploy` script exists at the specified application's
# `bin` directory...
if [ -e $APPS_PATH/$FILE/bin/deploy ]
then
  # Announce that we are executing it...
  echo "Executing $APPS_PATH/$FILE/bin/deploy"

  # ...and then execute it
  $APPS_PATH/$FILE/bin/deploy
else
  # Throw something in the log so we know some activity took place...
  # for an application that does not appear to either exist or be
  # properly set up.
  echo "'$FILE' does not appear to be a site set up to automatically deploy"
fi

# Clean up by deleting the file that was passed in...
rm $APPS_PATH/duct-tape.domainnamehere.com/shared_volume/$FILE
```


# docker-compose.yml

The `docker-compose.yml` file used to deploy this application is rather simple:

> **Note:** As described above, I have a `config` and `shared_volume` directory
> in the host server's "application directory" (see above).

```
version: '3'
services:
  server:
    image: tomkersten/duct-tape
    expose:
      - 9000
    restart: always
    volumes:
      - ./config:/opt/app/config:ro
      - ./shared_volume:/opt/app/shared_volume:rw
```

> **Note:** _Technically_ I have a few other directives in mine, but they
> are all related to things for an nginx/Let's Encrypt setup I use that is
> irrelevant to this discussion/example. I removed those lines to avoid
> confusion...

## Summary

Obviously this all makes some assumptions about my setup, but you can easily
adapt it to work however _your_ system is set up as well. The key is that
there is a tiny little very predictable executable that executes a defined
script on the host machine from activity inside a container. My directory-naming
or organizational patterns are really irrelevant to the overall approach.
