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
`inotify` on the host machine listen to the directory for application
deployment notifications...and re-run `docker-compose up --build` for it.

# Is this safe?

Although I don't see obvious issues with the general approach offhand for
small personal projects, there are probably many ways it could be abused.

So, use at your own risk and all that.
