# Introduction to LUInet & Genie

[[toc]]

## What is LUInet?

LUInet (Linguistic User Interface network) is Almond's natural language understanding component.
It is a large neural network that translates from natural language into executable [ThingTalk](/doc/thingtalk-intro.md) code.

Anyone can use LUInet to build new language user interfaces in their domains.
By making the LUInet open, we enable companies to build their own linguistic interfaces at a low cost, without in-house machine-learning expertise.
Research has shown that training for multiple domains all at once can improve the accuracy of individual domains.
By accumulating contributions from experts in different domains, we can create an open LUInet that can be stronger than any proprietary model
developed by one company. 

## What is Genie?

LUInet is a powerful neural model, and as such it is very data hungry. To help developers acquire
data to train their customized LUInets, we have developed Genie, a generator of training data.

Genie takes advantage of the _compositionality_ of natural language: from a limited set of primitives,
you can write an exponential number of possible commands.
Furthermore, note that while generating sentences in human languages is very hard, generating programs in a formal language is easy, because there is a formal grammar and typesystem that specifies exactly which string is valid and which string is meaningless.

From these two principles, Genie proposes that developers _data-program their natural language support_
with compositional templates.
Like data programming in other contexts, the methodology begins with acquiring a high-quality _validation set_ that is representative of real-world data. This validation set must be obtained in some way that does not bias whoever writes it, and must be manually annotated. Even better, it could be an existing source of real, unbiased data, like IFTTT is for Almond.
Manual annotation is expensive, but the validation set is small (around 1500 sentences for Almond), so this is still feasible.

Then we propose that developers represent the training set using _templates_. These templates are associated with semantic functions, and draw a map from the composition operators in program space to the composition of natural language primitives. This allows developers to succinctly represent various ways to express the same commands; Genie then converts this representation with existing sources of data and crowdsourced paraphrases to generate a large high-quality training set. On this training set, Genie trains a model, and evaluates on the validation set. The developers can then iterate and add templates or crowdsource more paraphrases until a good validation accuracy is achieved.

<video style="max-width:100%" controls autoplay loop>
<source src="https://almond-static.stanford.edu/papers/genie-animation.mp4" type="video/mp4">
<source src="https://almond-static.stanford.edu/papers/genie-animation.webm" type="video/webm">
Your browser does not support playing videos.
</video>

## How to Train a Customized LUInet?

At this stage, there are two options for a customized LUInet, with different levels of complexity depending on
the amount of customization desired.

The first, and simplest option is to _subset_ Thingpedia
to build a natural language interface taylored to your domain. In this setting, Thingpedia will automatically
train and maintain a natural language model using only the skills you enable. This model will be available
over [the same API](/doc/my-api.md) as the regular shared LUInet, and will take advantage of all the improvements to LUInet.
At this stage, you must ask us (over email or in the community forum) to enable a customized model for you.
We are planning to make this available from the website in the future.

The other option is to deploy a customized natural language stack using your own infrastructure.
This will allow you to use a customized version of Genie (including new construct templates for your domain),
as well as a customized version of the Almond engine, if needed. Please refer to the [Guide To Deploying Almond](/doc/installing-almond-cloud.md)
to learn more.

## How to Use Genie?

To customize Genie, and train a custom natural language model, you should install the [Genie Toolkit](https://github.com/stanford-oval/genie-toolkit),
and follow the instructions in its [README](https://github.com/stanford-oval/genie-toolkit/blob/master/README.md).
Once you have a trained model, use the [Guide To Deploying Almond](/doc/installing-almond-cloud.md) to deploy the model
to your users.

## Pretrained Models and Datasets

To download the continuously updated, live version of the main Almond natural language model for American English, use the following links:

- <https://almond-training.stanford.edu/models/default/en/current/best.pth>
- <https://almond-training.stanford.edu/models/default/en/current/config.json>
- <https://almond-training.stanford.edu/models/default/en/current/thingpedia.json>

The files can be downloaded and saved in a Genie model directory.

Additional resources, such as string and entity datasets, are available for download. Follow the links in the sidebar for more information.
Thingpedia metadata can also be downloaded using the [Thingpedia API](/doc/thingpedia-api). 

You can also find our research models and published datasets on our [research group page](https://oval.cs.stanford.edu/releases/).
