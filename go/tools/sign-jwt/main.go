package main

import (
	"almond-cloud/config"
	"almond-cloud/dbproxy"
	"fmt"
	"os"
	"strconv"
)

func main() {
	signingKey := config.GetAlmondConfig().JWTSigningKey
	fmt.Println("using signing key", signingKey)
	id, _ := strconv.ParseInt(os.Args[1], 10, 64)
	token, err := dbproxy.SignToken(id)
	fmt.Printf("%d: %s err:%v\n", id, token, err)
}
