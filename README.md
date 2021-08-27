# Thingpedia & Web Almond

[![Build Status](https://travis-ci.com/stanford-oval/almond-cloud.svg?branch=master)](https://travis-ci.com/stanford-oval/almond-cloud)
[![Coverage Status](https://coveralls.io/repos/github/stanford-oval/almond-cloud/badge.svg?branch=master)](https://coveralls.io/github/stanford-oval/almond-cloud?branch=master)
[![Dependency Status](https://david-dm.org/stanford-oval/almond-cloud/status.svg)](https://david-dm.org/stanford-oval/almond-cloud)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/stanford-oval/almond-cloud.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/stanford-oval/almond-cloud/context:javascript)
[![Discord](https://img.shields.io/discord/642041264208085014)](https://discord.gg/anthtR4)
[![Discourse status](https://img.shields.io/discourse/https/community.almond.stanford.edu/status.svg)](https://community.almond.stanford.edu)

This repository contains Thingpedia, the open, crowdsourced knowledge base for
the Almond virtual assistant. It also contains Web Almond, a cloud service to
provide Almond through a web interface.

The production branch of this repository is deployed at
<https://almond.stanford.edu>

Thingpedia is part of Almond, a research project led by
prof. Monica Lam, from Stanford University.  You can find more
information at <https://oval.cs.stanford.edu>.

## Development

1.  You need Git.
    
    Mac:
    
    1.  Install [Homebrew](https://brew.sh/)
    2.  Install Git:
        
            brew install git
    
2.  Clone this repository.
    
    You can clone it wherever you want, but if you don't know where to put it I
    recommend:
    
        mkdir -p "${HOME}/src/github.com/stanford-oval" && cd "${HOME}/src/github.com/stanford-oval"
    
    to create a directory and change into it.
    
    Then
    
        git clone --branch wip/nrser/k8s-dev-setup https://github.com/stanford-oval/almond-cloud.git
    
    and change into the cloned repository with
    
        cd almond-cloud

3.  You need Kubernetes running locally. For Windows and Mac we recommend 
    [Docker Desktop][]. After installation, follow the
    [instructions](https://docs.docker.com/desktop/kubernetes/#enable-kubernetes)
    to enabled Kubernetes.
    
    On Linux, there are (of course) several options. [Minikube][], [MicroK8s][]
    and [Kind][] are the ones I've heard of. These instructions will follow a
    Docker Desktop installation, so adjust as needed.
    
    [Docker Desktop]: https://www.docker.com/products/docker-desktop
    [Minikube]: https://github.com/kubernetes/minikube
    [MicroK8s]: https://microk8s.io/
    [Kind]: https://github.com/kubernetes-sigs/kind

4.  Build the Almond Cloud Docker image
    
        docker build -f docker/Dockerfile -t localhost/almond-cloud .

5.  Install the latest `kustomize`.
    
    Mac:
    
        brew install kustomize
    
    Windows and Linux: Follow their installation
    [instructions](https://kubectl.docs.kubernetes.io/installation/kustomize/).
    
    If you're on the Mac, I recommend the Homebrew option.
    
    > ### NOTE ###
    > 
    > Kustomize _does_ come bundled with the `kubectl` utility that Kubernetes
    > installations ship with, but some or all will be too out-of-date
    > for our needs.
    
    [Kustomize]: https://kustomize.io/

6.  Deploy the Kubernetes Dashboard
    
        kustomize build k8s/dashboard/dev | kubectl apply -f -
    
    In a separate terminal, run
    
        kubectl proxy
    
    and keep that terminal open.
    
    Visit
    
    http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/
    
    to view the dashboard (there shouldn't be much there yet!).

7.  Deploy the Nginx Ingress Controller
    
        kustomize build k8s/ingres-nginx/dev | kubectl apply -f -

8.  Create a [Mailgun][] account (if you don't already have one) and get the
    _SMTP_ username and password for the domain you want to use to send emails.
    
    If you use the "sandbox" domain, make sure you add your email address to the
    _Authorized Recipients_ and click the confirmation link they mail to you.
    
    [Mailgun]: https://www.mailgun.com/
    
9.  Create a local dev environment file
    
    1.  Create a text file in the `dev` directory named `.env`
    2.  Add these lines to the file, replacing the stuff between the `'` quotes
        with the SMTP credentials from the last step and your email address.
        
            MAILGUN_SMTP_USERNAME='postmaster@your-domain.mailgun.org'
            MAILGUN_SMTP_PASSWORD='your-smtp-password'
            DEVELOPER_EMAIL='you@yourself.com'
    3.  Save the file.
    
10. Generate your `kustomize` secret file
    
        ./dev/bin/almond-dev.configure.bash
    
    The secret file is written to `k8s/config/dev/secret.yaml`.

11. Check your config files build successfully with `kustomize`
    
        kustomize build ./k8s/dev
    
    You should see a big dump of `YAML` to the screen. If there is an error,
    try to figure it out or ask for help.

9.  Deploy Almond Cloud
    
    Check that your `kubectl` context is correct as in the previous step, then:
    
        kustomize build ./k8s/dev | kubectl apply -f -
    
10. Go back to the dashboard and switch to the `almond-dev` namespace.
    
    You should see the Almond Cloud components booting up. It can take a few
    minutes for everything to "go green", but after that you can use Almond
    Cloud at
    
    http://localhost:8080


## Installation

For detailed installation instructions, see
[our wiki](https://wiki.almond.stanford.edu/user-guide/almond-cloud/install).
