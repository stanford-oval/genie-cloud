from keras.models import model_from_json, load_model

import numpy, math, pickle

filehandler = open('bert_embedding.obj', 'rb')
bert_embedding = pickle.load(filehandler)

model = load_model('classifier.h5')


def encode_sentences(sentences):
    encoded_sentences = []

    for i in range(len(sentences)):

        temp = [sentences[i]]
        result = bert_embedding(temp)

        for j in range(len(result[0][1])):
            encoded_sentences.append(result[0][1][j])

    return numpy.array(encoded_sentences)

def output_probabilities(sentence):

    if sentence != None:

        encoded = (encode_sentences([sentence]))

        prediction = (model.predict(encoded))
        probability_question = 0
        for i in range(len(prediction)):
            probability_question = probability_question + prediction[i][0]

        probability_command = 0
        for i in range(len(prediction)):
            probability_command = probability_command + prediction[i][1]

        probability_chatty = 0
        for i in range(len(prediction)):
            probability_chatty = probability_chatty + prediction[i][2]

        probability_other = 0
        for i in range(len(prediction)):
            probability_other = probability_other + prediction[i][3]

        total = math.sqrt(probability_question) + math.sqrt(probability_command) + math.sqrt(probability_chatty) + math.sqrt(probability_other)

        return (math.sqrt(probability_question)/total, math.sqrt(probability_command)/total, math.sqrt(probability_chatty)/total, math.sqrt(probability_other)/total)

    else:
        return None

def main():

    probabilities = (output_probabilities(sys.stdin.readlines()[0]))
    print(probabilities[0])
    print(probabilities[1])
    print(probabilities[2])
    print(probabilities[3])


if __name__ == '__main__':
    main()
