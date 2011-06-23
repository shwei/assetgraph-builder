var _ = require('underscore'),
    seq = require('seq'),
    AssetGraph = require('assetgraph'),
    uglifyAst = require('assetgraph/lib/util/uglifyAst'),
    i18nTools = require('../util/i18nTools');

function bootstrapCode() {
    window.one = window.one || {};

    one.localeId = document && document.documentElement && document.documentElement.getAttribute('lang');

    one.getStaticUrl = function (url) { // , placeHolderValue1, placeHolderValue2, ...
        var placeHolderValues = Array.prototype.slice.call(arguments, 1);
        return url.replace(/\*/g, function () {
            return placeHolderValues.shift();
        });
    };

    (function installOneDevelopmentMode() {
        one.include = function () {};

        one.localize = true;

        // Helper for getting a prioritized list of relevant locale ids from a specific locale id.
        // For instance, "en_US" produces ["en_US", "en"]
        function expandLocaleIdToPrioritizedList(localeId) {
            if (!localeId) {
                return [];
            }
            var localeIds = [localeId];
            while (/_[^_]+$/.test(localeId)) {
                localeId = localeId.replace(/_[^_]+$/, '');
                localeIds.push(localeId);
            }
            return localeIds;
        }

        var prioritizedLocaleIds = expandLocaleIdToPrioritizedList(one.localeId);

        one.tr = function (key, defaultValue) {
            var keyByLocaleId = one.i18nKeys[key];
            if (keyByLocaleId) {
                for (var i = 0 ; i < prioritizedLocaleIds.length ; i += 1) {
                    if (typeof keyByLocaleId[prioritizedLocaleIds[i]] !== 'undefined') {
                        return keyByLocaleId[prioritizedLocaleIds[i]];
                    }
                }
            }
            return defaultValue || '[!' + key + '!]';
        };

        one.trPattern = function (key, defaultPattern) {
            var pattern = one.tr('key', defaultPattern);
            if (typeof pattern !== 'string') {
                throw new Error('one.trPattern: Value must be a string: ' + pattern);
            }
            return function () { // placeHolderValue, ...
                var placeHolderValues = arguments;
                // FIXME: The real ICU syntax uses different escaping rules, either adapt or remove support
                return pattern.replace(/\{(\d+)\}|((?:[^\{\\]|\\[\\\{])+)/g, function ($0, placeHolderNumberStr, text) {
                    if (placeHolderNumberStr) {
                        return placeHolderValues[placeHolderNumberStr];
                    } else {
                        return text.replace(/\\([\\\{])/g, "$1");
                    }
                });
            };
        };

        one.getText = function (url) {
            // Do a synchronous XHR in development mode:
            var xhr;
            try {
                xhr = new XMLHttpRequest();
            } catch (e) {
                try {
                    xhr = new ActiveXObject('Microsoft.XmlHTTP');
                } catch (e) {}
            }
            if (!xhr) {
                throw new Error("one.getText: Couldn't initialize an XMLHttpRequest object.");
            }
            xhr.open('GET', url, false);
            xhr.send();
            if (xhr.status && xhr.status >= 200 && xhr.status < 400) {
                return xhr.responseText;
            } else {
                throw new Error("one.getText: Unexpected response from the server: " + (xhr && xhr.status));
            }
        };
    }());
}

module.exports = function (queryObj) {
    if (!queryObj) {
        throw new Error("transforms.injectOneBootstrapper: The 'queryObj' parameter is required.");
    }
    return function injectOneBootstrapper(assetGraph, cb) {
        seq(assetGraph.findAssets(queryObj))
            .parEach(function (initialAsset) {
                if (initialAsset.type !== 'Html' && initialAsset.type !== 'JavaScript') {
                    return this(new Error('transforms.injectOneBootstrapper: queryObj must only match Html and JavaScript assets, but got ' + initialAsset));
                }
                i18nTools.extractAllReachableKeys(assetGraph, initialAsset, this.into(initialAsset.id));
            })
            .parEach(function (initialAsset) {
                var statementAsts = uglifyAst.getFunctionBodyAst(bootstrapCode),
                    allLanguageKeys = this.vars[initialAsset.id];
                // Add one.i18nKeys assignment to the end of the installDevelopmentMode function body:
                statementAsts[statementAsts.length - 1][1][1][3].push([
                    "stat",
                    [
                        "assign",
                        true,
                        [
                            "dot",
                            [
                                "name",
                                "one"
                            ],
                            "i18nKeys"
                        ],
                        uglifyAst.objToAst(allLanguageKeys)
                    ]
                ]);
                var bootstrapAsset = new AssetGraph.assets.JavaScript({parseTree: ['toplevel', statementAsts]});
                bootstrapAsset.url = assetGraph.root + "oneBootstrapper.js"; // Just so assetGraph.inlineAsset won't refuse
                assetGraph.addAsset(bootstrapAsset);
                if (initialAsset.type === 'Html') {
                    var htmlScript = new AssetGraph.relations.HtmlScript({
                        from: initialAsset,
                        to: bootstrapAsset
                    });
                    assetGraph.attachAndAddRelation(htmlScript, 'first');
                    htmlScript.node.setAttribute('id', 'oneBootstrapper');
                    assetGraph.inlineRelation(htmlScript, this);
                } else { // initialAsset.type === 'JavaScript'
                    assetGraph.attachAndAddRelation(new AssetGraph.relations.JavaScriptOneInclude({
                        from: initialAsset,
                        to: bootstrapAsset
                    }), 'first');
                }
                this();
            })
            .seq(function () {
                cb();
            })
            ['catch'](cb);
    };
};