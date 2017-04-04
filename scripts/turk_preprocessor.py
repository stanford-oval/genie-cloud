import os, sys, csv 

from Naked.toolshed.shell import execute_js 
from turk_scrubber import scrubber

def format(path):
    """ format raw turk data to: 'id, thingtalk, sentence, paraphrase'
    """
    with open(path + 'raw.csv', 'r') as fin, open(path + 'data.csv', 'w') as fout:
        reader = csv.reader(fin, delimiter=',', quotechar='\"')
        writer = csv.writer(fout, delimiter=',', quotechar='\"')

        headers = reader.next() 
        idx_rejection = headers.index('RejectionTime')
        idx_info = headers.index('Input.id1')
        idx_paraphrase = headers.index('Answer.Paraphrase1-1')
        
        for row in reader:
            # skip rejected answer
            if (row[idx_rejection] != ''):
                continue
            for i in range(3):
                ttid = row[idx_info + i*3]
                thingtalk = row[idx_info + i*3 + 1]
                sentence = row[idx_info + i*3 + 2].lower()
                for j in range(3):
                    paraphrase = row[idx_paraphrase + i*3 + j].replace('\n', ' ').lower()
                    writer.writerow([ttid, thingtalk, sentence, paraphrase])


def tt_to_sempre(path):
    """ run js script to get sempre json and parameter count
    """
    script = './turk_to_sempre.js'
    execute_js(script, path)


def clean(path): 
    """ clean data 
    """
    with open(path + 'data-sempre.csv', 'r') as data, \
         open(path + 'cleaned.csv', 'w') as cleaned, \
         open(path + 'dropped.csv', 'w') as dropped:
        reader = csv.reader(data, delimiter=',', quotechar='\"')
        writer_cleaned = csv.writer(cleaned, delimiter=',', quotechar='\"')
        writer_dropped = csv.writer(dropped, delimiter=',', quotechar='\"')
        for row in reader:
            scrubbed, row = scrubber(row)
            if scrubbed:
                writer_cleaned.writerow(row)
            else:
                writer_dropped.writerow(row)


def main():
    path = os.path.join(sys.argv[1])
    format(path)
    tt_to_sempre(path)
    clean(path)


main()
