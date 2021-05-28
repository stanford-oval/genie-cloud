# Prerequisites:

### Install Go 
Follow the instructions to install go:

https://golang.org/doc/install

For example:
```
wget https://golang.org/dl/go1.16.4.linux-amd64.tar.gz
rm -rf /usr/local/go && tar -C /usr/local -xzf go1.16.4.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin
go version
```
If installed correctly, you should see an output similar to:

```
go version go1.16.4 linux/amd64

```

### Fetch dependencies

```
cd github.com/stanford-oval/almond-cloud/go
go get ...
```

This may take a few minutes depending on network conditions. The packages will be
downloaded to `$GOPATH/pkg`. The default location is `$HOME/go/pkg`.
```


# Build

To build all binaries: 

```
go build ...
```

To build one binary, go the binary directory and run the command.
For example

```
cd dbproxy
go build
```

A binary will be built in the current directory.

# Install
To install all binaries:
```
go install ...
```

To install one binary:
```
cd dbproxy
go install
```

Difference between `install` and `build` is `install` will move built binary to `$GOPATH/bin`. The default location is `$HOME/go/bin`.