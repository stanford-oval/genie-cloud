#!/usr/bin/env python3

import sys
import MySQLdb
import MySQLdb.cursors

#mixing_prob = 0.3

with open(sys.argv[1], 'r') as fp2:
    devices = fp2.read().splitlines()

def process(utterance):
    name = '$__person'
    pronoun = "his"

    new_utterance = ""
    double_case = False
    if " i " in utterance.lower():
        double_case = True

    if " my " in utterance.lower():
        if double_case:
            new_utterance = utterance.replace(" my ", " " + pronoun + " ")
        else:
            new_utterance = utterance.replace(" my ", " " + name + "'s ")
    else:
        in_check = [" in " + device.lower() in utterance.lower() for device in devices]
        if any(in_check):
            if double_case:
                new_utterance = utterance.replace(" in ", " in " + pronoun + " ")
            else:
                device = devices[in_check.index(True)].lower()
                try:
                    ind = utterance.lower().split().index(device)
                    device_utt = utterance.split()[ind]
                    new_utterance = utterance.replace(" in " + device_utt + " ", " in " + device_utt + " of " + name + " ")
                except ValueError:
                    pass
        on_check = [" on " + device.lower() in utterance.lower() for device in devices]
        if any(on_check):
            if double_case:
                new_utterance = utterance.replace(" on ", " on " + pronoun + " ")
            else:
                device = devices[on_check.index(True)].lower()
                try:
                    ind = utterance.lower().split().index(device)
                    device_utt = utterance.split()[ind]
                    new_utterance = utterance.replace(" on " + device_utt + " ", " on " + device_utt + " of " + name + " ")
                except ValueError:
                    pass
    new_utterance = new_utterance.replace(" I ", " " + name + " ").replace(" i ", " " + name + " ")
    return new_utterance

def main():
    conn = MySQLdb.connect(user='thingengine', passwd=sys.argv[3],
                           db='thingengine',
                           host=sys.argv[2])
    cursor = conn.cursor(cursorclass=MySQLdb.cursors.DictCursor)
    cursor.execute("select kind, name, confirmation, confirmation_remote, version from "
                   + "device_schema ds, device_schema_channel_canonicals dsc where ds.id = dsc.schema_id and"
                   + " dsc.version = ds.developer_version and kind_type <> 'global' and language = 'en'")
    for row in cursor.fetchall():
        if row['confirmation_remote'] != row['confirmation']:
            continue
        print(row['kind'] + ':' + row['name'], process(row['confirmation']))

if __name__ == '__main__':
    main()
