# Web Almond API

Web Almond is the convenient web interface for the Almond assistant provided on this website.
Web Almond can also be used from third-party applications using the following
set of APIs.

All API are accessible under `https://almond.stanford.edu/me/api`, or the equivalent endpoint
for a different Web Almond server.

[[toc]]

## Authentication

Web Almond uses the OAuth 2.0 Authorization Flow as specified in [RFC 6749](https://tools.ietf.org/html/rfc6749#section-4.1).

### Step 1: Authorization

The first step in OAuth 2.0 is to call the authorization endpoint from the client. This will show a confirmation
page to the user asking to grant access to Web Almond. After the user confirms the authorization, the browser will be redirected to the URI you specified,
with a query parameter `code` set to the temporary authorization code.

You must have a client ID to access this page. You can obtain both the client ID
and the client secret from the [developer portal](/thingpedia/developers).

```
GET /me/api/oauth2/authorize
```

Parameters:

```
response_type: "code"
client_id: "JIK283K"
redirect_uri: "http://yourapp.com/almond_auth"
scope: "profile user-read"
```

In the callback, you should pass the requested authorization scopes (space-separated), which must be a subset
of the scopes you requested when you registered your client. Valid scopes are:

- `profile`: see the user's profile
- `user-read`: read active commands and devices
- `user-read-results`: read results of active commands
- `user-exec-command`: execute ThingTalk code
- `developer-read`: read unapproved devices (equivalent to a developer key)
- `developer-upload`: upload new devices
- `developer-admin`: modify thingpedia organization settings, add/remove members.

You can request fewer scopes than those you registered for. Indeed, to ensure the best
user experience and safety it is recommended to request the minimal scope necessary for
the immediate functionality of your app, and upgrade as needed.

Example redirect: `http://yourapp.com/almond_auth?code=ABCDEFGHIJ123456`

If the user denies the authorization, you will receive a query parameter `error=access_denied`.

### Step 2: Access Token
After authorization, your client will exchange the authorization code to receive an access token, which can be used
to issue authenticated requests.

```
POST /me/api/oauth2/token
```

Parameters:

```
grant_type: "authorization_code"
client_id: "JIK283K",
client_secret: "12345678901234"
code: "ABCDEFGHIJ123456"
redirect_uri: "http://yourapp.com/almond_auth"
```

Example access token response:

```
{
  "access_token": "XYZIEOSKLQOW9283472KLW",
  "refresh_token": "....",
  "token_type": "Bearer",
  "expires_in": "3600"
}
```

The redirect URI must be the same as originally passed to the `/authorize` endpoint, or
authentication will fail.

To support revocation, the access token expires quickly. In addition to the access token, you will receive
a long-lived refresh token. You should store this in your database, and use it to
obtain new access tokens at a later time.

### Step 3: Use the Access Token

The obtained access token can be used to issue authenticated requests by passing it into
the `Authorization` header:

```
Authorization: Bearer XYZIEOSKLQOW9283472KLW
```

All endpoints support this form of authentication.

Additionally, for compatibility with browser environments (where setting the `Authorization` header is not possible),
Web Socket endpoints also support passing the access token in the query string as the `access_token` parameter:

```
GET /me/api/conversation?access_token=XYZIEOSKLQOW9283472KLW
```

This is not recommended unless absolutely necessary though, as it will result in the access token being
logged in the clear in your browser history, web inspector, and elsewhere. Note in particular that server-side
Web Socket libraries (such as [ws](https://github.com/websockets/ws) for node.js) support setting the `Authorization`
header.

### Step 4: Refresh the Access Token

After the access token expires, you should request a new access token:

```
POST /me/api/oauth2/token
```

Parameters:

```
grant_type: "refresh_token"
client_id: "JIK283K",
client_secret: "12345678901234"
refresh_token: "...."
```

Example access token response:

```
{
  "access_token": "XYZIEOSKLQOW9283472KLW",
  "refresh_token": "....",
  "token_type": "Bearer",
  "expires_in": "3600"
}
```

Note that you might receive a different refresh token in response to this call,
and you should update your database accordingly.

If the refresh token is invalid, or the user has revoked permission to your client,
you will receive an `invalid_grant` error. In that case, you should restart the authentication
flow from the beginning.

## Endpoint: /profile

Read the user's profile.

Method: GET  
Scope: `profile`

```
GET /me/api/profile
Authorization: Bearer XYZIEOSKLQOW9283472KLW

HTTP/1.1 200 Ok
Content-Type: application/json

{
  "id": "....",
  "username": "bob",
  "full_name": "Bob Builder",
  "email": "bob@example.com",
  "email_verified": 1,
  "locale": "en-US",
  "timezone": "America/Los_Angeles",
  "model_tag": "default"
}
```

Use this endpoint to retrieve the details of the logged-in user, such as username, email and locale.

This endpoint uses the `profile` scope, which is always available.

## Endpoint: /conversation

Open an interactive Web Almond conversation.

Method: [Web Socket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)  
Scope: `user-exec-commands`

```
GET /me/api/conversation
Connection: Upgrade
Upgrade: websocket
Authorization: Bearer XYZIEOSKLQOW9283472KLW
```

Operation on this web socket consists of sending and receiving messages to drive a single Almond
conversation, which is automatically created upon connection and disposed of when the connection
is closed.

For details on how to control a conversation with Almond, see the [Almond Dialog API Reference](/doc/almond-dialog-api-reference.md).

## Endpoint: /apps/create

Execute a single ThingTalk command.

Method: POST  
Scope: `user-exec-commands`

```
POST /me/api/apps/create
Authorization: Bearer XYZIEOSKLQOW9283472KLW
Content-Type: application/json

{"code":"now => @com.thecatapi(id=\"com.thecatapi\").get() => notify;"}

HTTP/1.1 200 Ok
Content-Type: application/json

{
    "uniqueId": "...",
    "description": "get a cat picture",
    "code": "now => @com.thecatapi(id=\"com.thecatapi\").get() => notify;",
    "icon": "https://almond-static.stanford.edu/icons/com.thecatapi.png",
    "results": [{
      "outputType": "com.thecatapi:get",
      "raw": {
        "picture_url": "...",
        "image_id": "...",
        "link": "..."
      },
      "formatted": [{
        "type": "rdl",
        "webCallback": "...",
        "displayText": "...",
      }, {
        "type": "picture",
        "url": "..."
      }]
    }],
    "errors": []
}

```

You can execute a single ThingTalk command and retrieve the results using the `/apps/create` endpoint.
You should pass a single JSON object as the request body, containing the ThingTalk code as the `code`
property.

The API will return the unique ID of the program; if the program is long-running, you can use this ID
to stop it at a later time. The API will also return the description and icon of the program. 

For each result returned by the command, you will receive a JSON object containing `raw` and `formatted`
properties. `raw` contains the ThingTalk values returned by the program, and is an object whose keys
are the input and output parameters of the APIs in the program. `formatted` contains
a list of Almond messages, suitable for display in a conversation. See the [Almond Dialog API Reference](/doc/almond-dialog-api-reference.md)
for details of the content of the `formatted` field.

## Endpoint: /apps/list

Execute list active long-running ThingTalk commands.

Method: GET  
Scope: `user-read`

```
GET /me/api/apps/list
Authorization: Bearer XYZIEOSKLQOW9283472KLW

HTTP/1.1 200 Ok
Content-Type: application/json

[{
  "uniqueId": "...",
  "description": "notify me when the latest Xkcd changes",
  "code": "monitor (@com.xkcd(id=\"com.xkcd\").get_comic()) => notify;",
  "icon": "https://almond-static.stanford.edu/icons/com.xkcd.png",
}]
```

Use this API to retrieve the unique ID, description, code and icon of active long-running programs.
The API returns a list of JSON objects, one for each command. If the command had an error, the object
will contain an `error` field with the error description.

## Endpoint: /apps/get/:uniqueId

Get details of a single active long-running ThingTalk commands.

Method: GET  
Scope: `user-read`

```
GET /me/api/apps/get/123456
Authorization: Bearer XYZIEOSKLQOW9283472KLW

HTTP/1.1 200 Ok
Content-Type: application/json

{
  "uniqueId": "123456",
  "description": "notify me when the latest Xkcd changes",
  "code": "monitor (@com.xkcd(id=\"com.xkcd\").get_comic()) => notify;",
  "icon": "https://almond-static.stanford.edu/icons/com.xkcd.png",
}
```

Operation of this API is identical to `/apps/list`, but it returns a single command by ID rather
than all commands.

## Endpoint: /apps/delete/:uniqueId

Stop an active long-running ThingTalk command.

Method: POST  
Scope: `user-exec-commands`

```
GET /me/api/apps/delete/123456
Authorization: Bearer XYZIEOSKLQOW9283472KLW

HTTP/1.1 200 Ok
Content-Type: application/json

{
  "status": "ok"
}
```

This API returns nothing on success, and an error on failure, e.g. if the ID does not refer to a running app.

## Endpoint: /parse

Parse a natural language command, and perform minimal processing.

Method: GET  
Scope: `user-read`

```
GET /me/api/parse?q=get+a+cat+picture
Authorization: Bearer XYZIEOSKLQOW9283472KLW

HTTP/1.1 200 Ok
Content-Type: application/json

{
  "tokens": ["get", "a", "cat", "picture"],
  "entities": {},
  "candidates": [{
    "score": 1,
    "code": "now => @com.thecatapi(id=\"com.thecatapi\").get() => notify;",
    "commandClass": "query",
    "devices": {
      "p_0": {
        "uniqueId": "com.thecatapi",
        "name": "The Cat API",
        "description": "Where every day is Caturday!",
        "kind": "com.thecatapi",
        "icon": "https://almond-static.stanford.edu/icons/com.thecatapi.png"
      }
    },
    "locations": {}
  }]
}
```

This is a convenience API that combines natural language parsing with device assignment.
The API will parse the input sentence, and, for each candidate parse, compute the relevant devices,
auto-configure them if needed, and otherwise assign them or compute the list of assignable choices.

The API will also automatically handle `$context.location.home` and `$context.location.work`
if the user has previously configured those locations.
