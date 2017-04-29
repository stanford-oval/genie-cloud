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

## Conversation

After authenticating, commands can be issued to Web Almond by opening a Web Socket connection to the
following endpoint and passing the access token in the header.

```
GET /me/api/conversation
Connection: Upgrade
Upgrade: websocket
Authorization: Bearer XYZIEOSKLQOW9283472KLW
```

### Input Format

Web Almond conversation API exchanges JSON payloads as text over the Web Socket channel.
The API accepts 2 types of inputs:

 1. Natural Language Command
 2. Parsed JSON Command

The natural language command can be passed by supplying the command field
in the input JSON:

```
{
  "type": "command",
  "text": "help"
}
```

In addition, the client can supply commands in JSON format to handle other forms
of inputs like button or specials (yes/no, cancel, etc).

```
{
  "type": "parsed",
  "json": "\{\\"special\\":\{\\"id\\":\\"tt:root.special.yes\\"\}\}"
}
```

NOTE: when passing a pre-parsed command in JSON format, the `json` field of the message
should be set to the string representation of the JSON command, not the raw object. This
is why you see one extra layer of escaping in the example.

### Response Format

Web Almond responds to each input with a series of replies corresponding to the
generated output. The handling of the replies is left to the convenience of the client.

```
{"type":"text","text":"Here is a list of what I can do. Click on each of the categories to see corresponding devices.","icon":null}
{"type":"button","title":"Media","json":"{\\"command\\":{\\"type\\":\\"help\\",\\"value\\":{\\"id\\":\\"tt:type.media\\"}}}"}
{"type":"button","title":"Social Networks","json":"{\\"command\\":{\\"type\\":\\"help\\",\\"value\\":{\\"id\\":\\"tt:type.social-network\\"}}}"}
{"type":"button","title":"Home","json":"{\\"command\\":{\\"type\\":\\"help\\",\\"value\\":{\\"id\\":\\"tt:type.home\\"}}}"}
{"type":"button","title":"Communication","json":"{\\"command\\":{\\"type\\":\\"help\\",\\"value\\":{\\"id\\":\\"tt:type.communication\\"}}}"}
{"type":"button","title":"Health and Fitness","json":"{\\"command\\":{\\"type\\":\\"help\\",\\"value\\":{\\"id\\":\\"tt:type.health\\"}}}"}
{"type":"button","title":"Services","json":"{\\"command\\":{\\"type\\":\\"help\\",\\"value\\":{\\"id\\":\\"tt:type.service\\"}}}"}
{"type":"button","title":"Data Management","json":"{\\"command\\":{\\"type\\":\\"help\\",\\"value\\":{\\"id\\":\\"tt:type.data-management\\"}}}"}
{"type":"button","title":"Make Your Own Rule","json":"{\\"command\\":{\\"type\\":\\"make\\",\\"value\\":{\\"value\\":\\"rule\\"}}}"}
{"type":"askSpecial","ask":null}
```

Each reply has a specified 'type' indicating the format of the output that was generated.
The formats for each type of reply is specified below:

 * "text": a regular assistant message; `text` contains the output text and the `icon` contains the device on which the
   action is being performed.

   The full URL of the icon is https://d1ge76rambtuys.cloudfront.net/icons/{icon}.png
   ```
   {"type":"text", "text":"What do you want to post?", "icon":"com.facebook"}
   ```
 * "rdl": a Rich Deep Link, usually generated as output from some interface; `rdl` contains an object with `displayTitle` (the title of
   the link), `displayText` (a longer description of the link), `callback` (the deep link) and
   `webCallback` (a regular browser link)
   ```
   {"type":"rdl", "rdl":{"type":"rdl","displayTitle":"ISS Solar Transit 2","callback":"http://xkcd.com/1830","webCallback":"http://xkcd.com/1830"},"icon":"com.xkcd"}
   ```
 * "picture": a picture; `url` points to the picture url
   ```
   {"type":"picture", "url":"http://i.imgflip.com/1o3jf0.jpg", "icon":"com.imgflip"}
   ```
 * "button": a button that triggers a predefined user response; `title` contains the button text and the `json` contains the input JSON
   that needs to be passed to process the button.
   ```
   {"type":"button", "title":"Make Your Own Rule", "json":"{\\"command\\":{\\"type\\":\\"make\\",\\"value\\":{\\"value\\":\\"rule\\"}}}"}
   ```
 * "link": an internal link on the Almond website, used for configuring devices; `title` contains the anchor text and `url` contains the hyperlink
   ```
   {"type": "link", "title":"Configure Twitter", "url":"/devices/oauth2/com.twitter"}
   ```
 * "choice": a multiple choice button; `idx` enumerates the choice space. For each choice, the `title` contains
   the textual description of the choice; `text` optionally provides a longer description of each choice.
   ```
   {"type":"choice","idx":0,"title":"Twitter Account TesterAlice","text":null}
   {"type":"choice","idx":1,"title":"Twitter Account rakesh_testing","text":null}
   ```
   When the user clicks a multiple choice button, you should send a pre-parsed JSON of the form:
   ```
   {"answer":{"type":"Choice","value":<idx>}}
   ```
   where `<idx>` is the actual choice the user made.

 * "askSpecial": this message indicates that Almond is expecting some response from the user. In response to
   this, you can show a specialized picker or change the style of the keyboard.
   The `ask` parameter indicates what type of input Almond is expecting in the conversation.
   ```
   {"type":"askSpecial","ask":"yesno"}
   ```
   The following values are allowed for `ask`:
   * `yesno`
   * `location`
   * `picture`
   * `phone_number`
   * `email_address`
   * `contact`
   * `number`
   * `date`
   * `time`
   * `command`: a primitive Almond command
   * `generic`: Almond is expecting an answer of some other type
   * `null`: Almond is __not__ expecting an answer and it's back to the default context

### Useful special commands

The follow pre-parsed commands can be issued at any time to exhance the Almond UI:

 * `{"special":{"id":"tt:root.special.yes"}}`: yes (when Almond expects a yes/no)
 * `{"special":{"id":"tt:root.special.no"}}`: no (when Almond expects a yes/no)
 * `{"special":{"id":"tt:root.special.nevermind"}}`: cancel and reset Almond
 * `{"special":{"id":"tt:root.special.train"}}`: enter training mode, letting the user override the interpretation of a command
 * `{"special":{"id":"tt:root.special.help"}}`: show help; when Almond expects an answer, this will tell the user what Almond expects
 * `{"special":{"id":"tt:root.special.debug"}}`: show debug statistics
