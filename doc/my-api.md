# Web Almond API Reference

Web Almond is an easy and convenient web interface for the
Almond assistant https://thingpedia.stanford.edu. To access Web Almond natively,
the user must be logged into Thingpedia before making requests.

Web Almond can also be used from third-party applications using the following
set of APIs.

## Authentication

### Thingpedia Login

Thingpedia login page can be retrieved using the following endpoint:

```
GET /user/login
```

### OAuth2 Flow

Web Almond uses the OAuth 2.0 Authorization Flow as specified in [RFC 6749](https://tools.ietf.org/html/rfc6749#section-4.1).
The OAuth2 grant flow has the following 2 steps:

 1. Call the authorization endpoint from the client using the clientID
    and the redirectURI that is called after authorization code is generated.

    ```
    GET /me/api/oauth2/authorize
    ```

    Parameters:

    ```
    response_type: "code"
    client_id: "JIK283K"
    redirect_uri: "http://yourapp.com/almond_auth"
    ```

    Example authorization response:

    ```
    {
      'code': "ABCDEFGHIJ123456"
    }
    ```

 2. The client then exchanges the authorization code to receive an access token.

    ```
    GET /me/api/oauth2/token
    ```

    Parameters:

    ```
    grant_type: "authorization_code"
    code: "ABCDEFGHIJ123456"
    redirect_uri: "http://yourapp.com/almond"
    ```

    Example access token response:

    ```
    {
      'access_token': "XYZIEOSKLQOW9283472KLW",
      'token_type': "Bearer",
      'expires_in': 3600
    }
    ```

## Conversation

After authenticating, commands can be issued to Web Almond by calling the
following endpoint and passing the access token in the header.

```
GET /me/api/conversation

Authorization: "Bearer XYZIEOSKLQOW9283472KLW"
```

### Input Format

Web Almond conversation API accepts 2 types of inputs:

 1. Natural Language Command
 2. Parsed JSON Command

The natural language command can be passed by supplying the command field
in the input JSON:

```
{
  'type': "command",
  'input': "help"
}
```

In addition, the client can supply commands in JSON format to handle other forms
of inputs like button or specials (yes/no, cancel, etc).

```
{
  'type': "parsed",
  'input': "\{\\"special\\":\{\\"id\\":\\"tt:root.special.yes\\"\}\}"
}
```

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

 * "text": 'text' contains the output text and the 'icon' contains the device on which the
   action is being performed.
   ```
   {"type":"text","text":"What do you want to post?","icon":"com.facebook"}
   ```
 * "rdl": 'rdl' contains the output JSON, formatted differently for each deviceChannel
   in Thingpedia.
   ```
   {"type":"rdl","rdl":{"type":"rdl","displayTitle":"ISS Solar Transit 2","callback":"http://xkcd.com/1830","webCallback":"http://xkcd.com/1830"},"icon":"com.xkcd"}
   ```
 * "picture": 'url' points to the picture url
   ```
   {"type":"picture","url":"http://i.imgflip.com/1o3jf0.jpg","icon":"com.imgflip"}
   ```
 * "button": 'title' contains the button text and the 'json' contains the input JSON
   that needs to be passed to process the button.
   ```
   {"type":"button","title":"Make Your Own Rule","json":"{\\"command\\":{\\"type\\":\\"make\\",\\"value\\":{\\"value\\":\\"rule\\"}}}"}
   ```
 * "link": 'title' contains the anchor text and 'url' contains the hyperlink
   ```
   { type: 'link', title: title, url: url }
   ```
 * "choice": 'idx' enumerates the choice space. For each choice, the 'title' contains
   the textual description of the choice.
   ```
   {"type":"choice","idx":0,"title":"Twitter Account TesterAlice","text":null}
   {"type":"choice","idx":1,"title":"Twitter Account rakesh_testing","text":null}
   ```
 * "askSpecial": Almond handles special command types such as yes/no, cancel, etc differently.
   The 'ask' parameter indicates what type of input Almond is expecting in the conversation.
   ```
   {"type":"askSpecial","ask":"yesno"}
   ```
