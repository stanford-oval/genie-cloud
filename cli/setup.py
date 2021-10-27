import setuptools

setuptools.setup(
    name="almond-cloud-cli",
    version="0.0.0",
    author="Stanford OVAL",
    author_email="thingpedia-admins@lists.stanford.edu",
    description="Command Line Interface (CLI) for Almond Cloud development and deployment",
    url="https://github.com/stanford-oval/almond-cloud",
    packages=setuptools.find_packages(),
    python_requires=">=3,<4",
    install_requires=[
        "splatlog>=0.1.0",
        "clavier>=0.1.2",
        "kubernetes>=19.15.0,<20",
    ],
    scripts=[
        "bin/almond-cloud",
    ],
)
