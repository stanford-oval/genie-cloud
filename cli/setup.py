import setuptools
from subprocess import run

def get_version() -> str:
    return run(
        ["git", "describe"],
        capture_output=True,
        encoding="utf-8",
    ).stdout.strip()

setuptools.setup(
    name="almond-cloud-cli",
    version=get_version(),
    author="Stanford OVAL",
    author_email="thingpedia-admins@lists.stanford.edu",
    description="Command Line Interface (CLI) for Almond Cloud development and deployment",
    url="https://github.com/stanford-oval/almond-cloud",
    packages=setuptools.find_packages(),
    python_requires=">=3,<4",
    install_requires=[
        "splatlog>=0.1.0",
        "argcomplete>=1.12.3,<2",
    ],
    scripts=[
        "bin/almond-cloud",
    ],
)
