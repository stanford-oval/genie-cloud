import json
import re, sys
from random import random
from difflib import SequenceMatcher
from collections import defaultdict

def scrubber(rule_type, row):
    """ take a row and try to clean the paraphrase, return if it is successfully 
    cleaned, along with the information extracted 
    """
    paraphrase = Paraphrase(rule_type, *row)
    if paraphrase.is_noidea():
        return False, paraphrase.dropped_info('noidea')
    paraphrase.clean()
    status = paraphrase.cleaned()
    if status == 'clean':
        return True, paraphrase.info()
    else:
        print status
        print paraphrase.ttid
        print paraphrase.synthetic
        print paraphrase.paraphrase
        return False, paraphrase.dropped_info(status)


def coin(prob):
    """ flip a coin
    """
    if random() < prob: return True
    else: return False
    

class Paraphrase:
    def __init__(self, rule_type, ttid, target_json, target_tt, synthetic, paraphrase):
        self.rule_type = rule_type
        self.ttid = ttid
        self.paraphrase = paraphrase
        self.json = json.loads(target_json)
        self.tt = target_tt
        self.args = self._extract_args()
        self.synthetic = synthetic
        self.set = 'train' if coin(0.7) else 'test'
        
    def _extract_args(self):
        """ extract argument types and values from parsed json
        """
        args = defaultdict(list)
        cmd_types = ['trigger', 'query', 'action']
        arg_types = ['String', 'URL', 'EmailAddress', 'Username', 'Hashtag']

        if self.rule_type == 'command':
            if 'rule' in self.json:
                parsed = self.json['rule']
                self.type = 'compound'
            else:
                self.type = 'primitive'
                parsed = self.json
        else:
            parsed = self.json['access']
            if 'person' in parsed:
                args['person'].append(parsed['person'])

        for t in cmd_types:
            if t in parsed:
                if 'person' in parsed[t]:
                    args['person'].append(parsed[t]['person'])
                for arg in parsed[t]['args']:
                    if arg['type'] in arg_types:
                        args[arg['type']].append(arg['value']['value'].lower())
                if 'predicate' in parsed[t]:
                    for arg_list in parsed[t]['predicate']:
                        for arg in arg_list:
                            if arg['type'] in arg_types:
                                args[arg['type']].append(arg['value']['value'].lower())
        return args

    def _extract_quoted(self):
        """ extract double quoted string from paraphrase
        e.g., "abc" def "xyz" -> ["abc", "xyz"]
        note that re.findall will return ["abc", " def ", "xyz"]
        """
        quoted = re.findall(r'(?<=\")[^\"]*(?=\")', self.paraphrase)
        return quoted[::2]

    def _extract_tags(self):
        """ extract tags from paraphrase
        """
        tags = re.findall(r'(?<=#)[\w]*', self.paraphrase)
        return tags

    def _extract_usernames(self):
        """ extract tags from paraphrase, avoid emails 
        """
        usernames = re.findall(r'(?<!\w)@[\w]*', self.paraphrase)
        #usernames += re.findall(r'(?<!\w)@[\w]*', ' '.join(self.paraphrase.split("'")))
        #usernames += re.findall(r'(?<!\w)@[\w]*', ' '.join(self.paraphrase.split(".")))
        usernames = [u[1:] for u in usernames]
        return usernames

    def info(self):
        """ return a list of info for the final output
        """
        #return [self.ttid, self.json, self.paraphrase, self.set, self.type, len(self.args)]
        return [self.paraphrase, self.tt, json.dumps(self.json)]

    def dropped_info(self, status):
        """ return a list of info for the final output
        """
        #return [self.ttid, self.json, self.paraphrase, self.set, self.type, len(self.args)]
        return [status, self.paraphrase, self.tt, json.dumps(self.json)]

    def clean(self):
        """ clean up paraphrase
        """
        self._fix_typos()

        if not self._is_correctly_quoted():
            self._match_quotes()
            self._double_quotes()
            self._uniformize_quoted()
            self._add_quotes()

        self._add_space()
        self._remove_space()

        self._fix_links()

        if not self._is_correctly_mentioned():
            self._fix_person()
        
    def _fix_typos(self):
        """ fix all kinds of wierd typos 
        """
        typos = {
            '0nedrive': 'onedrive',
            '@standford': '@stanford',
            '@sanford': '@stanford',
            '@standord': '@stanford',
            '@standform': '@stanford',
            '@standard': '@stanford',
            '@stanforf': '@stanford',
            '@staford': '@stanford',
            '@stanfor.edu': '@stanford.edu',
            '@stanford.edy': '@stanford.edu',
            '@justbieber': '@justinbieber',
            '@justinbeiber': '@justinbieber',
            '@justin bieber': '@justinbieber'
        }
        for typo in typos:
            self.paraphrase = self.paraphrase.replace(typo, typos[typo])

    def _double_quotes(self):
        """ replace single quote pairs by double quote pairs
        """
        q = re.findall(r'(?<![\w\",.])\'', self.paraphrase)
        q += re.findall(r'\'(?![\w])', self.paraphrase)
        if len(q) > 1:
            self.paraphrase = re.sub(r'(?<![\w\",.])\'', r'"', self.paraphrase)
            self.paraphrase = re.sub(r'\'(?![\w])', r'"', self.paraphrase)

    def _match_quotes(self):
        """ fix the case of using both double and single quotes
        """
        for arg in self.args['String']:
            self.paraphrase = self.paraphrase.replace('"' + arg + '\'', '"' + arg + '"')
            self.paraphrase = self.paraphrase.replace('\'' + arg + '"', '"' + arg + '"')

    def _uniformize_quoted(self):
        """ find similar quoted string and replace 
        """
        quoted = self._extract_quoted()
        for string in quoted:
            if string in self.args['String']:
                continue
            similar = self._find_similar(string)
            if (similar):
                self.paraphrase = self.paraphrase.replace('\"' + string + '\"', similar)
            else:
                self.paraphrase = self.paraphrase.replace('\"' + string + '\"', string)

    def _add_quotes(self):
        """ add quote to unquoted string
        """
        for arg in self.args['String']:
            if self.paraphrase.count('"' + arg + '"') > 0:
                continue
            else:
                self.paraphrase = re.sub(r'(?<=\s)' + arg + r'(?=\s)', '"' + arg + '"', self.paraphrase)
                self.paraphrase = re.sub(r'(?<=^)' + arg + r'(?=\s)', '"' + arg + '"', self.paraphrase)
                self.paraphrase = re.sub(r'(?<=\s)' + arg + r'(?=$)', '"' + arg + '"', self.paraphrase)
                self.paraphrase = self.paraphrase.replace('""', '"')

    def _find_similar(self, pattern):
        """ find similar pattern in args
        """
        for arg in self.args['String']:
            if SequenceMatcher(None, pattern, arg).ratio() > 0.7:
                return arg
        return False

    def _add_space(self):
        """ add space between numbers and units, greater/less than sign and 
        numbers
        """
        matches = re.findall(r'[0-9][A-Za-z]', self.paraphrase)
        for match in matches:
            self.paraphrase = self.paraphrase.replace(match, ' '.join(match))
        matches = re.findall(r'[<>][0-9]', self.paraphrase)
        for match in matches:
            self.paraphrase = self.paraphrase.replace(match, ' '.join(match))

    def _remove_space(self):
        """ remove space after @ and # 
        """
        self.paraphrase = self.paraphrase.replace('@ ', '@').replace('# ', '#')

    def _fix_links(self):
        """ fix links
        """
        for url in self.args['URL']:
            if url in self.paraphrase:
                continue
            similar = [
                url[len('http://'):], 
                url[len('http://www.'):],
                url.replace('www.', '')
            ]
            for s in similar:
                if s in self.paraphrase:
                    self.paraphrase = self.paraphrase.replace(s, url)
                    continue

    def _fix_person(self):
        """ fix the person name
        """
        in_paraphrase = self._extract_usernames()
        in_json = [str(s) for s in self.args['Username'] + self.args['person']]
        if len(in_json) == 1 and len(in_paraphrase) == 1:
            self.paraphrase = self.paraphrase.replace(in_paraphrase[0], in_json[0])
        elif len(in_json) == 1 and len(in_paraphrase) == 0 and in_json[0] in self.paraphrase:
            self.paraphrase = self.paraphrase.replace(in_json[0], '@' + in_json[0])
        else:
            pass

    def cleaned(self):
        """ check if the paraphrase is cleaned
        """
        if not self._check_links():
            return 'links'
        if not self._check_quotes_paring():
            return 'quotes'
        if not self._check_emails():
            return 'emails'
        if not self._is_correctly_quoted():
            return 'quotes'
        if not self._is_correctly_tagged():
            return 'tags'
        if not self._is_correctly_mentioned():
            return 'users'
        return 'clean'


    def _is_correctly_quoted(self):
        """ check if a paraphrase has correct quoting
        """
        in_paraphrase = self._extract_quoted()
        in_json = self.args['String']
        if set(in_paraphrase) == set(in_json):
            return True
        else:
            return False

    def _is_correctly_tagged(self):
        """ check if a paraphrase has correct hashtag followed by #
        """
        in_paraphrase = self._extract_tags()
        in_json = self.args['Hashtag']
        if set(in_paraphrase) == set(in_json):
            return True
        else:
            return False

    def _is_correctly_mentioned(self):
        """ check if a paraphrase has correct username followed by @
        """
        in_paraphrase = self._extract_usernames()
        in_json = self.args['Username'] + self.args['person']
        if set(in_paraphrase) == set(in_json):
            return True
        else:
            return False

    def _check_quotes_paring(self):
        """ check the quote pairing """
        if self.paraphrase.count('"') % 2 == 1:
            return False
        return True
    

    def _check_links(self):
        """ check the links
        """
        for url in self.args['URL']:
            if url not in self.paraphrase:
                return False
        return True
                
    def _check_emails(self):
        for email in self.args['EmailAddress']:
            if email not in self.paraphrase:
                return False
        return True


    def is_noidea(self):
        noideas = [
            'no idea', 'don\'t know', 'dont know', 'don\'t understand',
            'dont understand', 'no clue',
            'doesn\'t make sense', 'doesn\'t make any sense'
            'doesnt make sense', 'doesnt make any sense'
        ]
        for string in noideas:
            if string in self.paraphrase:
                return True
        return False

