from bert_embedding import BertEmbedding

bert_embedding = BertEmbedding()
# Import BERT Embedding library from PyPi

import numpy, json, random, math


def encode_sentence(sentence):

    # Takes input of list of sentences and returns numpy array with BERT Embedding for each word

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


def create_other(words):
    """
    function creates random sentences consisting of random words from the dictionary or random spam words.
    Artificial data is created using this function to train the Other class. This approach works better than
    detecting out of distribution data because the encoding of certain unrelated words may be similar which would
    cause an out of distribution sentence to be classified as part of one of the 3 main classes. By creating this Other
    class and feeding it with an unproportionally large amount of data relative to all of the classes except commands,
    any data which is not clearly part of one of the 3 main classes should be classified as Other.
    """

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


def create_training_data():

    questionDataLength = 1000
    commandDataLength = 10000
    chattyDataLength = 500
    otherDataLength = 10000
    cutoff = 20

    train_data = unparsed_data("train/questions1.json", questionDataLength, cutoff)
    input_data = numpy.zeros([questionDataLength, 15360])

    for i in range(questionDataLength):
        print(i)
        input_data[i] = encode_sentence(train_data[i])

    length = len(input_data)

    train_data = unparsed_data("train/questions2.json", questionDataLength, cutoff)
    input_data1 = numpy.zeros([questionDataLength, 15360])

    for i in range(questionDataLength):
        print(i)
        input_data1[i] = encode_sentence(train_data[i])

    length1 = len(input_data1)

    # We need to feed a lot more data to commands because it is by far the most diverse class
    train_data = unparsed_data("train/commands.json", commandDataLength, cutoff)
    input_data2 = numpy.zeros([commandDataLength, 15360])

    for i in range(commandDataLength):
        print(i)
        input_data2[i] = encode_sentence(train_data[i])

    length2 = len(input_data2)

    """
    We don't need to feed too much data to the chatty class because chatty text is usually just
    simple phrases such as "hi", "hey", "ok", "whats up", etc. If we train the NN on too much chatty text
    it'll return too many false positives.
    """
    train_data = parsed_data("train/chatty1.json", chattyDataLength, cutoff)
    input_data3 = numpy.zeros([chattyDataLength, 15360])

    for i in range(chattyDataLength):
        print(i)
        input_data3[i] = encode_sentence(train_data[i])

    length3 = len(input_data3)

    other_dataset = []
    for i in range(otherDataLength):
        other_dataset.append(create_other(words))

    input_data4 = numpy.zeros([otherDataLength, 15360])

    for i in range(otherDataLength):
        print(i)
        input_data4[i] = encode_sentence(other_dataset[i])

    length4 = len(input_data4)

    X = numpy.append(input_data, input_data1, 0)

    X = numpy.append(X, input_data2, 0)

    X = numpy.append(X, input_data3, 0)

    X = numpy.append(X, input_data4, 0)

    Y1 = numpy.full((length + length1, 4), 1)
    for i in range(len(Y1)):
        Y1[i][1] = 0
        Y1[i][2] = 0
        Y1[i][3] = 0
    Y2 = numpy.full((length2, 4), 1)
    for i in range(len(Y2)):
        Y2[i][0] = 0
        Y2[i][2] = 0
        Y2[i][3] = 0

    Y3 = numpy.full((length3, 4), 1)
    for i in range(len(Y3)):
        Y3[i][0] = 0
        Y3[i][1] = 0
        Y3[i][3] = 0

    Y4 = numpy.full((length4, 4), 1)
    for i in range(len(Y4)):
        Y4[i][0] = 0
        Y4[i][1] = 0
        Y4[i][2] = 0

    Y = numpy.append(Y1, Y2, 0)

    Y = numpy.append(Y, Y3, 0)

    Y = numpy.append(Y, Y4, 0)

    return X, Y


training_data = create_training_data()
x_train = training_data[0]
y_train = training_data[1]

from keras.layers import Dense, Dropout
from keras.models import Sequential
from keras.optimizers import Adam

optimizer = Adam(0.0002, 0.5)

# Simple Feed Forward Neural Network with a couple hidden layers
model = Sequential()

model.add(Dense(16, activation="relu", input_dim=15360))

# Hidden - Layers
model.add(Dropout(0.3, noise_shape=None, seed=None))
model.add(Dense(8, activation="relu"))
model.add(Dropout(0.2, noise_shape=None, seed=None))
model.add(Dense(4, activation="relu"))
# Output- Layer

model.add(Dense(4, activation="sigmoid"))
model.summary()

model.compile(loss="binary_crossentropy", optimizer="adam", metrics=["accuracy"])

model.fit(x_train, y_train, epochs=50, batch_size=100, shuffle=True)

model.save("classifier.h5")
print("Saved model to disk")
