set -x

# First run control.js 
#    node control.js


# Then run master
node master.js  \
  --shared \
  --thingpedia-url /thingpedia \
  --nl-server-url https://nlp-staging.almond.stanford.edu \
  --oauth-redirect-origin https://dev.almond.stanford.edu \
  --control-url http://localhost:8080

# Test with test_client.js
#    node test_client.js
