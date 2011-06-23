var vows = require('vows'),
    assert = require('assert'),
    AssetGraph = require('assetgraph'),
    transforms = require('../lib/transforms');

vows.describe('executeJavaScriptConditionalBlocks').addBatch({
    'After loading test case': {
        topic: function () {
            new AssetGraph({root: __dirname + '/runJavaScriptConditionalBlocks'}).queue(
                transforms.loadAssets('index.html'),
                transforms.populate()
            ).run(this.callback);
        },
        'the graph should contain a single JavaScript asset': function (assetGraph) {
            assert.equal(assetGraph.findAssets({type: 'JavaScript'}).length, 1);
        },
        'then running the conditional blocks': {
            topic: function (assetGraph) {
                assetGraph.queue(transforms.runJavaScriptConditionalBlocks({type: 'Html'}, 'theEnvironment')).run(this.callback);
            },
            'the Html should contain a new <div> with a greeting from the conditional block': function (assetGraph) {
                var html = assetGraph.findAssets({type: 'Html'})[0],
                    divs = html.parseTree.getElementsByTagName('div');
                assert.equal(divs.length, 1);
                assert.equal(divs[0].firstChild.nodeValue, "Howdy");
            }
        }
    }
})['export'](module);