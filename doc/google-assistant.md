# Google Assistant

You can use Google Assistant to access Thingpedia devices!

First, follow the instructions [here](https://developers.google.com/assistant/actions/actions-sdk) to create an Action package for Google Assistant.

Specifically, the Action package JSON file should be replaced with the following, taking care to replace `<YourActionName>` with your Action name.

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
          "queryPatterns": [
            "bye",
            "goodbye"
          ]
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

Then, upload your Action package by following the instructions [here](https://developers.google.com/assistant/actions/actions-sdk/create-a-project).

Next, you are ready to test your Action package!

Head to Google's [Action Console](https://console.actions.google.com/u/0/) and click on your project. Then click on the "Test" tab at the top.

Try entering "Talk to <YourActionName>" to start a conversation with your Action package. Then try commands such as those from the utterances in the `dataset.tt` file.

You can also test your Action package from your Google Assistant app on your mobile device. Just start the conversation with "Talk to <YourActionName>"!
