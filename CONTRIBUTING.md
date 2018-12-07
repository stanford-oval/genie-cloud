# Contribution Guidelines

Almond is an open project, and we welcome contributions from any interested party.
When opening an issue, pull request, or support ticket, please keep in mind the following guidelines.

## Issues and Feature Requests

If you believe you have found a bug in the documentation, the software (in any of the tested configurations)
or the [Almond website](https://almond.stanford.edu), please file a bug using GitHub issues.

If you know the bug is caused by one of the Almond libraries (eg thingtalk, or thingengine-core),
please file a bug directly against that library. If you know the bug is caused by a third-party dependency,
please file a bug upstream, and also file a bug here to urge us to update the dependency.
If you don't know which component to file the bug under, please file it here and we'll take care of it.

## Development Process

To develop a new feature or bug fix, you should fork the repository and create a new branch, based
off the `master` branch, dedicated to that feature. By convention, feature branches start with `wip/`.

After you're done with the feature, you should submit a Pull Request. Integration tests will automatically
run, and the PR will be reviewed by a member of the Almond team. You must make sure that all tests pass:
PRs will failing tests might not be reviewed, and will not be merged.

After merging to `master`, we periodically merge to `staging` as well, which deploys the code to our
testing infrastructure. Access to our testing infrastructure can be arranged by request. After automated
and manual testing, the feature will be merged to the `production` branch, which deploys it to <https://almond.stanford.edu>.

## Code of Conduct

In all interactions with the Almond project, you are expected to abide by some basic
rules of civility. The details of these rules, and how the rules are enforced, are in
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Furthermore, Almond is an official research project of Stanford University, an educational
institution in the United States. Hence, in all interactions with the Almond team, you
must comply with Title IX federal law, and Stanford University anti-discrimination policies.
Discrimination or harassment based on race, color, national or ethnic origin, sex, age,
disability, religion, sexual orientation, gender identity, veteran status, or marital
status will not be tolerated.
See [here](https://exploredegrees.stanford.edu/nonacademicregulations/nondiscrimination/)
for details.

## Licensing

Almond is copyright by Stanford. (Technically, by The Board of Trustees of The Leland Stanford Junior University.) 

In order for us to continue to be able to license Almond, and allow our sponsors to develop it commercially, we
need to make sure that contributions from others do not restrict Stanford.

Therefore, we can accept contributions on any of the following terms:

- If your contribution is a bug fix of 6 lines or less of new code, we will accept it on the basis that both you and us regard the contribution as _de minimis_, and not requiring further hassle.
- You can declare that the contribution is in the public domain (in your commit message or pull request).
- You can make your contribution available under a non-restrictive open source license, such as the Revised (or 3-clause) BSD license, with appropriate licensing information included with the submitted code.
- You can sign and return to us a contributor license agreement (CLA), explicitly licensing us to be able to use the code. There is a [Contributor License Agreement for Individuals](https://mobisocial.stanford.edu/cla-individual.html) and a [Contributor License Agreement for Corporations](https://mobisocial.stanford.edu/cla-corporate.html). You can send them to us or contact us at: thingpedia-admins@lists.stanford.edu .

