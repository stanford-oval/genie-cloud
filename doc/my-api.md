# Web Almond API Reference

Web Almond is an easy and convenient web interface for the
Almond assistant https://thingpedia.stanford.edu. To access Web Almond natively,
the user must be logged into Thingpedia before making requests.

Web Almond can also be used from third-party applications using the following
set of APIs.

## Authentication

### Thingpedia Login

The Web Almond login page can be retrieved using the following endpoint:

```
GET /user/login
```

### OAuth2 Flow

Web Almond uses the OAuth 2.0 Authorization Flow as specified in [RFC 6749](https://tools.ietf.org/html/rfc6749#section-4.1).
The OAuth2 grant flow has the following 2 steps:

 1. Call the authorization endpoint from the client. This will show a confirmation
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
    ```

    Example redirect: `http://yourapp.com/almond_auth?code=ABCDEFGHIJ123456`

    If the user denies the authorization, you will receive a query parameter `error=access_denied`.

 2. The client then exchanges the authorization code to receive an access token, which can be used
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
      "token_type": "Bearer",
    }
    ```

    The redirect URI must be the same as originally passed to the `/authorize` endpoint, or
    authentication will fail.

    Web Almond access tokens do not expire, so you will not receive a refresh token.

## Endpoint: /me/api/conversation

After authenticating, commands can be issued to Web Almond by opening a [Web Socket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) connection to the
following endpoint and passing the access token in the header.

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