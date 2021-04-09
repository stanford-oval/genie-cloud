set -x

# First run control.js first
#    node control.js


# Second run master
node master_server.js  \
  --shared \
  --thingpedia-url /thingpedia \
  --nl-server-url https://nlp-staging.almond.stanford.edu \
  --oauth-redirect-origin https://dev.almond.stanford.edu \
  --control-url http://localhost:8080

# Third test with test_client.js
#    node test_client.js
