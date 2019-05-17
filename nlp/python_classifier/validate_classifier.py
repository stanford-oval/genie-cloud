from bert_embedding import BertEmbedding
from keras.models import load_model
import json, numpy, math, random
from sklearn.metrics import f1_score, accuracy_score

# import metrics for validation

bert_embedding = BertEmbedding()
model = load_model("classifier.h5")

letters = [
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
]
with open("words.txt", "r") as file:
    words_file = file.read()

words = words_file.split("\n")
# data file consisting of words in dictionaries

with open("common_words.txt", "r") as file:
    common_words_file = file.read()

common_words = common_words_file.split("\n")
# data file consisting of the 10000 most commonly used words


def encode_sentence(sentence):

    # Takes input of list of sentences and returns list with BERT Embedding for each word

    encoded_sentence = numpy.zeros(15360)

    result = bert_embedding([sentence])
    index = 0
    for j in range(len(result[0][1])):
        if j < 20:
            for k in range(len(result[0][1][j])):

                encoded_sentence[index] = result[0][1][j][k]
                index += 1

    return encoded_sentence


def unparsed_data(file_path, limit, max_length):
    # takes json file input and returns list of sentences
    # function used for question and commands data
    with open(file_path) as json_file:
        data = json.load(json_file)

    split_data = data.split(',"')

    output_data = []

    for i in range(1, len(split_data)):

        if len(output_data) == limit:
            return output_data

        if split_data[i] != "":
            if len(split_data[i].split(" ")) < max_length + 1:
                output_data.append(split_data[i].replace('"', ""))

    return output_data


def parsed_data(file_path, limit, max_length):
    # for parsing chatty text, which is in a different format from the other json files
    with open(file_path) as json_file:
        data = json.load(json_file)

    output_data = []

    for i in range(1, len(data)):

        if len(output_data) == limit:
            return output_data

        if data[i] != "":
            if len(data[i].split(" ")) < max_length + 1:
                output_data.append(data[i])

    return output_data


def output_prediction(sentence):

    encoded = encode_sentence(sentence)

    test_data = numpy.zeros([1, 15360])
    test_data[0] = encoded

    if len(encoded) > 0:

        percentages = model.predict(test_data)

        total = 0

        adjusted_percentages = []
        for i in range(4):

            adjustedValue = math.sqrt(percentages[0][i])
            adjusted_percentages.append(adjustedValue)
            total = total + adjustedValue

        final_percentages = []
        for j in range(4):
            final_percentages.append(adjusted_percentages[j] / total)

        return final_percentages
    else:
        return (0.25, 0.25, 0.25, 0.25)


def create_other(words):

    spam_chance = random.randint(0, 10)
    if spam_chance == 1:
        spam_length = random.randint(0, 7)
        sentence = ""
        for i in range(spam_length):
            word_length = random.randint(0, 10)
            word = ""
            for j in range(word_length):
                index = random.randint(0, 25)
                letter = letters[index]
                word = word + letter
            sentence = sentence + word + " "

        return sentence
    else:
        sentence_length = random.randint(0, 10)
        sentence = ""
        for i in range(sentence_length):
            index = random.randint(0, len(words) - 1)
            word = words[index]
            sentence = sentence + word + " "
        return sentence


def validate_category(sentences):

    dataset_length = len(sentences)

    counter = 0

    predictions = numpy.zeros(dataset_length)

    for i in range(dataset_length):

        sentence = sentences[i]
        print(sentence)
        prediction = output_prediction(sentence)
        print(prediction)

        largest_index = 0
        largest_value = 0

        for j in range(len(prediction)):

            if prediction[j] > largest_value:
                largest_value = prediction[j]
                largest_index = j

        predictions[i] = largest_index

    return predictions


test_data_length = 500

questions = unparsed_data("test/question_test.json", test_data_length, 20)
commands = unparsed_data("test/command_test.json", test_data_length, 20)
chatty = parsed_data("test/chatty_test.json", test_data_length, 20)

other = []
for i in range(test_data_length):
    other.append(create_other(words))

prediction1 = validate_category(questions)
prediction2 = validate_category(commands)
prediction3 = validate_category(chatty)
prediction4 = validate_category(other)


predictions = numpy.append(prediction1, prediction2, 0)
predictions = numpy.append(predictions, prediction3, 0)
predictions = numpy.append(predictions, prediction4, 0)

true_predictions1 = numpy.full((test_data_length), 0)

true_predictions2 = numpy.full((test_data_length), 1)

true_predictions3 = numpy.full((test_data_length), 2)

true_predictions4 = numpy.full((test_data_length), 3)

true_predictions = numpy.append(true_predictions1, true_predictions2, 0)
true_predictions = numpy.append(true_predictions, true_predictions3, 0)
true_predictions = numpy.append(true_predictions, true_predictions4, 0)


f1_scores = f1_score(true_predictions, predictions, average=None)
accuracy = accuracy_score(true_predictions, predictions)
print("Total Accuracy: " + str(accuracy))

print("F1 score for questions: " + str(f1_scores[0]))
print("F1 score for commands: " + str(f1_scores[1]))
print("F1 score for chatty text: " + str(f1_scores[2]))
print("F1 score for other: " + str(f1_scores[3]))
