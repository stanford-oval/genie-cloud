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
        "clavier==0.1.3a2",
        "kubernetes>=19.15.0,<20",
        "pyyaml>=6.0,<7",
    ],
    scripts=[
        "bin/almond-cloud",
    ],
)
