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
