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

# Coding sytle

We will be following the guidelines from [Effective Go](https://golang.org/doc/effective_go) .
Formatting in go is done automatically by gofmt. The default plugins from VisualCode
does a pretty good job at auto-formatting the code on save.

# Build

To build all binaries:

```
cd go
go build -v ./...
```

To build one binary/package, go a directory and run the command.
For example

```
cd go/almond
go build
```

A binary will be built in the current directory.

# Run
To execute a binary without building, go the binary directory

```
cd go/almond
go run .
```

# Install
To install all binaries:

```
cd go
go install ./...
```

Difference between `install` and `build` is `install` will move built binary to `$GOPATH/bin`. The default location is `$HOME/go/bin`.

# Test
To test all:

```
cd go
go test -v ./...
```
