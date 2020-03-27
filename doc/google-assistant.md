# Google Assistant

You can use Google Assistant to access Thingpedia devices.

First, follow the instructions [here](https://developers.google.com/assistant/actions/actions-sdk) to create an Action package for Google Assistant.

Specifically, the Action package JSON file can be replaced with the following as an example, taking care to replace `<YourActionName>` with your Action name.

```
{
  "actions": [
    {
      "description": "Default Welcome Intent",
      "name": "MAIN",
      "fulfillment": {
        "conversationName": "<YourActionName>"
      },
      "intent": {
        "name": "actions.intent.MAIN",
        "trigger": {
          "queryPatterns": [
            "talk to <YourActionName>"
          ]
        }
      }
    },
    {
      "name": "TEXT",
      "intent": {
        "name": "actions.intent.TEXT",
        "trigger": {
          "queryPatterns": []
        }
      },
      "fulfillment": {
        "conversationName": "<YourActionName>"
      }
    }
  ],
  "conversations": {
    "<YourActionName>": {
      "name": "<YourActionName>",
      "url": "https://almond.stanford.edu/me/api/gassistant/fulfillment"
    }
  },
  "locale": "en"
}

```

## Action package

You can read more about the Action package at the Google documentation [here](https://developers.google.com/assistant/actions/actions-sdk/define-actions), but here is a brief guide to the JSON file.

The JSON object comprises three main properties - `actions`, `conversations` and `locale`.

`actions` refers to mappings between query patterns and intents. There is always a `MAIN` intent that welcomes the user when first invoked from Google Assistant. In our case, because we map text inputs to our own queries through Almond, we will only have one other `TEXT` intent receives all inputs. Hence, we can leave the `queryPatterns` attribute as a blank array.

`conversations` refer to specific endpoints that Google Assistant will direct the inputs to. These are also referenced in the `actions` attribute under the `fulfillment` property for each intent. In our case, there is only a single endpoint that receives all the intents.

Finally, `locale` simply refers to the locale for the action.

## Upload and test

Then, upload your Action package by following the instructions [here](https://developers.google.com/assistant/actions/actions-sdk/create-a-project).

Next, you can test your Action package with Google's Action Console or the Google Assistant app.

Head to Google's [Action Console](https://console.actions.google.com/u/0/) and click on your project. Then click on the "Test" tab at the top.

Enter "Talk to <YourActionName>" to start a conversation with your Action package. Then try commands such as those from the utterances in the `dataset.tt` file.

You can also test your Action package from your Google Assistant app on your mobile device. Just start the conversation with "Talk to <YourActionName>". Then proceed to try out different commands from your `dataset.tt` file.

## Authentication

For certain commands, users will have to authenticate themselves by logging into Almond.

To allow users to authenticate, first go to Almond's OAuth Applications page by clicking on Console at the top then OAuth Applications on the left, or simply clicking [here](https://almond-dev.stanford.edu/developers/oauth).

Then click "Register a new OAuth app" and fill in the following:

- Name: `Google Assistant` (or any name)
- Icon: Upload a relevant icon
- Allow Redirect URLs: `https://oauth-redirect.googleusercontent.com/r/<YOUR-PROJECT-ID>`
- Select the following permissions
  - Observe the results of executed commands and read notifications
  - Access Web Almond and execute ThingTalk code
  - Read the user's Thingpedia devices.

Finally, click "Create" and you should see your OAuth app, with a Client ID and Client Secret. These will be required later.

Next, go to Google's [Action Console](https://console.actions.google.com/u/0/) and click on your project. Then click on the "Develop" tab at the top.

Select the following options:

**Account Creation**

"No, I only want to allow account creation on my website"

**Linking Type**

- OAuth
- Authorization Code

**OAuth Client Information**

- Client ID from above
- Client Secret from above
- Authorization URL: `https://almond.stanford.edu/me/api/oauth2/authorize`
- Token URL: `https://almond.stanford.edu/me/api/oauth2/token`

**Configure Your Client**

- Add the `user-exec-command` scope

**Testing Instructions**

- Input `test`

Then click on "Save" at the top right.

Next, you can test the authentication via the "Test" tab at Google's Actions Console or via your Google Assistant app. Initiate the conversation with "Talk to <YourActionName>". Then enter "I want to sign in". 

If you are testing via the Actions Console, you will receive the message: "It looks like your account is not linked, so you’ll have to finish up on your phone. Is that okay?" Enter "Yes" and Google will send the sign-in link to you via the Google Home app. You can then click on the link from Google Home and sign in.

If you are testing via the Google Assistant app, you will receive the message: "To get your account details, I need to link your <YourActionName> account to Google. Is that OK?" Enter "Yes" and Google will redirect you to the Almond log-in page. You can then proceed to sign in.
