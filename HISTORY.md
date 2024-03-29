3.0.0
=====

* The assistant was fully rebranded to Genie [#1018, #1124].
* It is now possible to trigger the registration flow for a user in the middle of
  an anonymous conversation (using a modal dialogue). In that case, the conversation
  state is transferred to the newly created user [#1018].
* Added the ability to send notifications using emails and SMS, including the ability
  to stop and unsubscribe [#955, #1018].
* Added support for anonymous mode in multiple languages [#1018].
* Added the ability to use MySQL as the storage backend for the Genie user data
  instead of sqlite. Data from all users are stored in the same database, which
  is more scalable and more operationally efficient. For security, a proxy service
  with per-user authentication intermediates all accesses from the engine [#983,
  #989, #998, #1009, #1012, #1015, #1016, #1020, #1035, #1067].
* Added a Kubernetes-native controller to manage the execution of the engines.
  Engines for developer users are spawned as their own pod, while other engines
  used shared worker pods. The controller starts and stops the engines as needed
  [#1022, #1041, #1055, #1069, #1088, #1089].
* Added support for PKCE in OAuth proxy [#1021].
* Added rate-limiting to all endpoints, mitigating DoS and authentication brute-force [#1019].
* Added new scripts to download conversation logs for analysis [#1050].
* Expanded entity subtyping support to handle multiple inheritance [#1051].
* The TTS API is now accessible over GET endpoint [#1094].
* The NLP and TTS API endpoint now cache their output in Redis, if available [#1105, #1110].
* The NLP API server is now configured using the configuration file. The model database
  is ignored [#1114].
* Removed support for uploading custom Genie template packs, as Genie no longer supports
  custom templates without recompiling Genie.
* Removed support for custom training using the embedded training server. It is recommended
  to use a local Genie setup or use Kubeflow [#1114].
* The docker image no longer contains genienlp. It is recommended to use KFServing
  to run genienlp in a separate container instead [#1039].
* Added scripts and Kubernetes configuration files for local development using Kubernetes.
  The scripts include a Python CLI to control genie-cloud as well as a Kustomize
  plugin [#1090].
* Migrated codebase to TypeScript [#997, #1010, #1034].
* Misc bug fixes [#986, #1001, #1002, #1003, #1040, #1043, #1068, #1075, #1117, #1147].
* Build system and test fixes [#990, #991, #1091].
* Updated dependencies [#984, #993, #995, #996, #1004, #1006, #1011, #1012, #1017,
  #1025, #1026, #1029, #1030, #1032, #1033, #1036, #1046, #1054, #1056, #1057, #1058,
  #1060, #1061, #1079, #1083, #1092, #1093, #1095, #1104, #1106, #1111, #1112, #1113,
  #1115, #1116, #1118, #1120, #1121, #1123, #1125, #1135, #1137, #1138, #1140].

2.0.0
=====

* Added streaming speech-to-text API [#975].
* Added support for gender selection in text-to-speech API [#978].
* Commandpedia now only shows commands that are valid for the approved subset
  of devices [#981, #982].
* The UI styling has been updated, in particular in the conversation widget [#977].
* Updated dependencies [#969, #973].

Contributors to this release:
- Antonio Muratore
- Francesco Gialuppi

Please see the previous release for the full list of changes in this
development cycle.

2.0.0-beta.1
============

* It is now possible to set a default developer key when configuring Almond
  without an embedded Thingpedia [#880].
* Some experimental and less supported features have been removed. These
  include the blog, support for training custom models and generating custom
  datasets, custom Alexa skills, and the Train Almond page [#963].
* The cheatsheet has been restored and improved [#818, #959].
* Misc bug fixes [#951, #956, #957, #958, #960, #964, #967, #968].
* Updated dependencies [#927, #928, #954, #961, #962].

Contributors to this release:
- Jim Deng

2.0.0-alpha.1
=============

This is the first Alpha release of the Almond 2.0 release cycle. It brings
the latest version of the Almond platform, with several improvements across
the board. The high-level list of changes is available on the
[release page](https://wiki.almond.stanford.edu/en/release-planning/two-point-oh).

Among the almond-cloud specific changes are:

* Thingpedia was updated to support ThingTalk 2.0 and the latest set of
  annotations used by Genie.
* A new recording mode was added, that allows detailed recordings to be made
  of dialogues as they occur, including the full content of all executed ThingTalk
  programs and the replies from the agent. These recording can be used for
  testing and debugging.
* The NLP server now supports Kubeflow Serving as a backend for the actual NLP
  model, instead of spawning the model in the same container. This provides
  additional robustness and scalability when running in Kubernetes.
* The recommended package manager was switched to npm instead of yarn, to match
  what is used by the recent version of ThingTalk and Genie.

1.99.0
======

* Updated dependencies [#824, #825, #826, #827, #828, #829, #830, #831].
* Misc build fixes.

1.99.0-rc.1
===========

* Misc bug fixes [#821].
* Updated dependencies, fixing a number of issues in Genie [#823].

1.99.0-beta.1
=============

This is the first release to use the new Genie Toolkit as the core dialogue
system, replacing both the Almond dialogue agent and the ThingEngine. Genie
supports multi-turn interactions.

You can learn more about this release at
<https://wiki.almond.stanford.edu/en/release-planning/one-point-ninetynine>.

Additional changes:

* The whole package was relicensed to Apache 2.0 [#786].
* The /me/api/parse API endpoint was removed. Clients should use the NLP
  API directly [#766].
* Added a new endpoint to proxy OAuth requests from Almond Server [#808].
* PPDB augmentation was removed, as it was removed from Genie [#766].
* Thingpedia now supports entity statements in class definitions, so classes
  that define their custom entity types no longer need to add a definition
  separately [#769, #770, #796].
* Training was made more robust and more debuggable [#693].
* The scripts to download the datasets and the utterance logs were expanded.
  Utterance logs now track the time of the utterance too [#781, #809].
* The default NLP models now have a fallback system, so only one model is
  needed at minimum [#796].
* Uploading a string or entity datasets with the API now will replace the
  existing dataset instead of appending to it [#796]
* Misc bug fixes and code cleanups [#150, #769, #796].
* Updated dependencies [#697, #701, #702, #703, #705, #706, #713, #714, #715,
  #716, #717, #718, #719, #720, #721, #722, #723, #725, #726, #727, #729, #732,
  #735, #736, #737, #738, #739, #740, #741, #742, #745, #746, #747, #750, #751,
  #752, #755, #757, #758, #759, #761, #763, #764, #765, #768, #767, #770, #780,
  #785, #787, #778, #790, #797, #798, #799, #800, #801, #802, #803, #804, #805,
  #806, #807, #817, #819, #820].

1.8.0
=====

* Misc bug fixes [#691].
* Updated dependencies [#688, #690, #692].

1.8.0-beta.1
============

Frontend & Thingpedia:
* Web Almond now supports voice input. A "record" button has been added to all
  Web Almond pages [#686].
* Google Assistant support has been reintroduced, in a cleaned up and refactored way [#678].

NLP & training:
* Developers can now create MTurk batches and custom synthetic datasets, including datasets
  in MTurk mode. This provides a one-click solution to use MTurk to improve the accuracy
  of Thingpedia skills [#203, #681].
* Added support for the "defaultTemperature" unit, which allows Almond to interpret
  the word "degrees" according to the user's locale and preferences [#675].
* The voice API, that was previously provided by the almond-voice package, has been
  merged in almond-cloud. The new API also includes a combined voice + NLU endpoint [#677].
* The exact matcher has been refactored and now uses a dedicate on-disk data structure,
  which should significantly reduce memory usage [#644].
* The models have been updated to use the genienlp library instead of decanlp. genienlp
  provides a BERT-based model, which should yield higher accuracy [#685].

Misc:
* The NLP API is now fully documented [#671, #677].
* Misc bug fixes [#665, #684, #687].
* Documentation updates [#673, #674].
* Dependency updates [#683].

Contributors:
  Euirim Choi
  Swee Kiat (SK) Lim

1.7.3
=====

Frontend & Thingpedia:
* Device names that end in certain sensitive extensions (e.g. `com.foo.png`
  or `org.bla.html`) are no longer allowed [#625, #633].
* The UI to request device reviews has been removed [#618, #634].
* The admin user list now can be sorted by login or registration time [#341, #645].
* Train Almond now includes recording functionality, so Almond can be trained
  specifically with the output of speech-to-text [#661].
* Added the ability to track visitors using an Ackee server [#648].

NLP & training:
* Tensorboard support during training is now optimized for using local filesystem;
  it is recommended to mount the Tensorboard directory as a shared filesystem (e.g. NFS
  or CIFS/SMB) [#636].
* Custom models now show progress while training, and show metrics afterwards [#431, #433, #639].
* NLP admins no longer pay credits to train custom models from the developer console [#639].
* Models are now versioned, and can be downloaded from the web frontend [#432, #441, #640].
* Dataset updates no longer affect the training ETA [#598, #638].
* Contextual models are no longer trained, as they were experimental and broken [#603, #662].
* The experimental frontend classifier was removed; all inputs from the user are
  unconditionally treated as commands. This is not a behavior change as previously
  the classifier output was ignored [#656, #662].
* Misc bug fixes [#670].

Almond Website updates:
* The top bar is slightly bigger and bolder
* The Get Involved page was redesigned to give more prominence to featured
  projects and explain how different people can join the project [#649, #650].
* Added "Almond in the News" page [#628].

Operational changes:
* Dockerfiles have been coalesced, and the -decanlp image is no longer produced;
  now the main image includes the decanlp library and the NLP dependencies.
  Note that the new image does not ship the word embeddings (that were previously
  part of the -decanlp image); these must be mounted in docker and the appropriate
  path must be set as the DECANLP_EMBEDDINGS environment variable [#635].
* Docker images have been fixed to avoid having a long running shell process, which
  could lead to hung processes during stop.
* The boostrap command was extended to bootstrap the database schema as well, so the
  separate initialization step is no longer needed [#646].
* The Kubernetes example files have been updated, polished, and tested in minikube [#646, #647].
* The version of node-mysql has been updated and is now compatible with Amazon RDS
  with SSL enabled [#657].

Misc:
* Google Assistant support has been removed, as it was unmaintained [#659].
* Documentation updates [#660, #663, #667, #668, #669].
* Updated dependencies [#473, #627, #632, #637, #643, #655, #657, #658, #666].

Contributors:
  Euirim Choi
  Swee Kiat (SK) Lim
  Ricky Grannis-Vu

1.7.2
=====

* The Thingpedia API to retrieve entity icons has been removed, as
  it relied on questionable use of the Bing Image Search API. The API
  now always returns 404; previously, it would return 404 if an icon
  could not be found for a specific entity, so callers are already expected
  to handle this [#605].
* Custom LUINet models and templates now show the flags [#594, #604].
* Login is now required before accessing Train Almond; before, login
  was not required but the page would crash [#592, #608].
* MTurk sentences in the paraphrase page now include a link to the device
  details page [#583, #609].
* The NLP inference server now honors the developer_key query argument,
  and selects the developer model if the default model is requested
  [#615, #620].
* Misc bug fixes [#594, #595, #596, #597, #599, #601, #606, #607, #611, #613,
  #617, #619, #621, #623].
* Updated dependencies [#600, #610].

1.7.1
=====

* Classes returned by the API now consistently include the #_[canonical]
  annotation [#584].
* Fixed importing the same dataset multiple times, which would occasionally
  lose example names or click counts [#581].
* Fixed running on node 8 by making selenium-webdriver optional [#581].
* Fixed a number of bugs in the mturk subsystem [#581].
* Attempted fix of a long standing locking bug while updating multiple
  devices in close succession [#585]
* Misc bug fixes and website fixes [#581, #587, #588, #589, #590, #591].

1.7.0
=====

Frontend changes:
* Try Almond is now featured more prominently on our front page [#569]
* The permissions required to login with a Github account have been
  reduced to the minimum necessary; Github is no longer configured
  automatically in Almond [#519, #554]
* Added the option to show a platform-specific Cheatsheet; this
  hides platform-specific devices, and on server, also hides OAuth [#558, #559]
* Added support for pictures inside RDLs [#564]
* Entities and string datasets can now be updated after creation;
  the list of values are then merged [#571]

NLP changes:
* Added the ability to reload all replicas, which allows to replicate
  the NLP server for scalability [#417, #553]

Misc changes:
* Our docker images are now based on RHEL 8 (UBI) [#560]
* Translations are now loaded correctly by the sandboxed workers [#557]
* Misc bug fixes [#562, #563, #568, #570, #574]
* Updated translation: Italian [#555]
* Build system and dependency updates [#561, #566, #567, #576]

1.7.0-beta.1
============

High-level changes and new features:
* All commands and servers have been unified in a single "almond-cloud"
  script, with subcommands [#458].
* The training server was refactored entirely, and is now more robust
  and more scalable. Job information is now stored in MySQL, and survives
  a restart of the training server. Training tasks are executed as
  Kubernetes batch jobs; in the future multiple training tasks will be executed
  in parallel [#400, #448, #460, #468, #485, #492, #495, #512, #513, #517, #518, #529, #523].
* Official images of Cloud Almond are now available on dockerhub, in the
  stanfordoval/almond-cloud repository. Three images are available: one
  just of Almond, one including the DecaNLP library, and one including both
  DecaNLP and the Nvidia CUDA runtime [#453, #458, #478, #480, #544].

Frontend changes:
* New API: /me/api/converse. This is a REST-based endpoint to access the
  Almond dialog agent. It is provided for client who cannot use the WebSocket-based
  endpoint [#522].
* New API: /me/api/devices/create. Configures a new device in Almond [#522].
* Static assets have been moved to the /assets. This simplifies setting up
  a CDN, as it can be pointed to the frontend server directly [#413, #449].

Backend changes:
* Access to the configuration file from the worker sandbox has been removed
  entirely. This is not a security fix, as the access was safe if configured
  correctly, but removes a risk in case of misconfiguration.

NLP changes:
* It is now possible to run manual (crowdsourced) validation of paraphrase
  datasets [#202, #463].
* Models are now evaluated using the Genie metrics, which are both more
  accurate and more fine-grained [#434, #467].
* All training tasks now report progress, and progress is combined for the
  whole job [#456, #467].
* Training contextual models is now fully supported, including generation,
  augmentation, training and deployment. Contextual models are still experimental
  because the accuracy is poor [#362, #467, #536].

Operational changes:
* Multiple configuration files can now be supplied, in the /etc/almond-cloud/config.d
  folder. They can be in JS, YAML or JSON format [#429, #457].
* Integration with S3 has been improved and is now first class.
  The training buckets for Thingpedia, for the training server and for the
  inference server can now be configured [#430, #470, #471, #483, #534, #538].
* It is now possible to specify a remote server for the Almond tokenizer [#455].

Other changes:
* Documentation has been expanded, and now includes automatically generated
  jsdocs for the Almond libraries [#496, #497, #498, #535, #548]
* Scripts are now also included as the main almond-cloud entrypoint. Two
  scripts are provided: `download-dataset` and `upload-dataset`. They can
  be used to download (resp. upload) TSV files with sentences and code [#458, #527].
* DB migrations are now applied in cronological order, based on git history
  time [#425, #466].
* Google Assistant support is now optional and disabled by default [#499].
* The Almond platform has been updated to the 1.7 series, including ThingTalk 1.9.
  This brings in a new number of new features [#279, #487, #526, #531, #541, #543, #551].
* Misc bug fixes [#416, #462, #464, #465, #472, #475, #476, #477, #482, #484, #486,
  #493, #501, #503, #525, #528, #530, #532, #545].
* Build system, CI and dependency updates [#479, #481, #488, #491, #494, #505, #507, #509, #514, #515, #516,
  #520, #524, #537].

1.6.3
=====

* Fixed training custom models [#474, #489]
* Fixed API inconsistencies in the location linking API [#489]
* Improved compatibility with thingpedia command-line tool [#489]
* Misc bug fixes [#489]
* Updated dependencies

1.6.2
=====

* Fixed incorrect formatting for dates and times.
* Fixed training and updating custom models and the exact matches [#461, #465]
* Improved appeareance on mobile [#465]
* Misc bug fixes [#465]
* Updated dependencies

1.6.1
=====

* Custom NLP models can now make use of the exact matcher [#419, #442]
* Evaluation of NLP models now correctly distinguishes paraphrases and developer data,
  resulting in more accurate metrics [#446]
* Fixed developer NLP models [#409]
* Fixed killing GPU training jobs [#408, #410]
* Misc bug fixes [#438, #439, #443, #444, #445, #447, #450, #452]
* Updated dependencies [#440]

1.6.0
=====

* The automatic training system was refactored. Updating the exact match
  dataset after uploading a device is now significantly faster, and the chances
  of failure due to database lock timeout should be greatly reduced [#337, #395, #396].
* Automatic evaluation of trained model is now based on realistic data,
  not paraphrase data, which means the accuracy numbers reported in the admin
  dashboard are more meaningful [#337].
* The developer program is now controlled by a separate configuration variable,
  and can be enabled even if the embedded Thingpedia is not used [#337].
* Organizations can now upload custom Genie template packs, and create customized
  LUInet models that use a subset of Thingpedia, use custom template packs, or
  have different Genie parameters [#337, #395].
* An experimental credit system was added. Organizations receive credits for
  contributing public devices and template packs, and can use credits to create
  custom LUInet models [#380, #386].
* Added experimental support for creating custom Alexa skills backed by Thingpedia
  devices. These skills use Alexa AI (intent + slot classifier) [#371, #384, #395].
* Added a new API to lookup locations, which eliminates the need for location
  preprocessing in almond-tokenizer. Compatibility code for old ThingTalk versions
  has been added [#357, #358].
* Added a new API to upload devices. The API is OAuth-protected and is suitable
  to use in CI workflows to upload devices automatically after testing [#376].
* Added new API to download string datasets. The API requires a developer key
  to audit who downloads which dataset and ensure licensing compliance [#388].
* The snapshot lookup API now respects the developer key, closing another loophole
  that exposes unapproved devices. Only devices that were approved at the time of
  the snapshot are exposed. The list of snapshots is now public [#359].
* Primitive templates (dataset.tt entries / examples in Thingpedia API) now support
  a `#[name]` annotation, which is used to construct named intents for third-party
  AI integration [#371].
* docker builds of training and NLP inference servers are now officially supported,
  and we provide example configurations for Kubernetes. The example configurations
  match those used in our production infrastructure [#365, #399].
* The frontend classifier was revamped and converted to use PyTorch and pytorch-transformers
  instead of Keras and Tensorflow. This should result in a smaller dependency footprint
  and better model quality [#369].
* The initialization and routing logic in the frontend was refactored, so that
  public Thingpedia APIs are no longer accessible through cookie authentication, and no
  longer influenced by cookies. This is safer as it reduces the risks from CSRF [#382].
* I18n code was consolidated and made uniform. All pages now support a `?locale` parameter
  to retrieve the page and data in a different language (for supported languages) [#371].
* The rules for usernames and emails have been made stricter. Usernames are now case
  insensitive and must use ASCII alphanumeric characters only. Emails must be unique.
  This matches Discourse and helps when SSO integration is enabled [#350].
* Misc bug fixes [#350, #370, #372, #378, #382, #385, #387, #389, #395, #402].
* Updated dependencies [#343, #354, #361, #363, #374, #377, #390, #391, #393].

1.5.1
=====

* The website has been redesigned and has now clearer calls to action [#328].
* The /about/research page has been removed, and replaced with a link
  the OVAL website.
* The blog code has been expanded in functionality to support external
  news links [#329].
* The "Configure a new device" & "Add a new account" pages in My Almond
  have been merged [#326, #336].
* Rules for usernames and emails have been tightened, preventing duplicate
  users with similar usernames, invalid or dangerous usernames, or duplicate
  emails. This improved the compatibility with Discourse SSO [#350]
* Misc bug fixes [#336, #338, #339, #350]

1.5.0
=====

* The Thingpedia pages have been made more user friendly, with less code
  and more explanation of each device function [#259].
* 2-factor authentication now offers a "Remember Me" options [#289, #301].
* Users can now change their locale from the Settings, choosing from the
  enabled languages [#44].
* Added "Login With Github" option [#274, #290].
* The configuration format was changed, and no longer requires environment
  variables for security.
* Web Almond now offers Readline-like history [#172, #318].
* Translation support for refreshed and is now fully functional [#16, #17, #134, #302].
* New Thingpedia API: /entities/create and /strings/create to upload
  new entities or string datasets (useful for scripts) [#311].
* Updated documentation, with a particular focus on deploying a custom
  version of Almond Cloud [#283, #248, #277, #295, #296].
* Added experimental support for contextual predictions in the NLP server.
  This relies on an appropriately trained contextual Genie model; there is
  no automatic training support yet. The API might change in the future [#317].
* Added an experimental frontend classifier to the NLP server. This classifier
  determines a confidence level that the user input is a supported ThingTalk
  command, a general-knowledge question (suitable for a search engine) or a chatbot
  command. The API is experimental and the dialog agent does not make use of this
  information yet [#286, #294].
* Misc bug fixes [#22, #28, #272, #281, #288, #291, #292, #298, #299, #300, #303,
  #305, #307, #308, #315].

Contributors in this release:
- Ryan Cheng
- Tanay Sonthalia
