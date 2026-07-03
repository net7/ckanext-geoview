// Openlayers preview module

(function() {

    if (window.Proj4js) {
        // add your projection definitions here
        // definitions can be found at http://spatialreference.org/ref/epsg/{xxxx}/proj4js/
        proj4.defs("EPSG:3003", "+proj=tmerc +lat_0=0 +lon_0=9 +k=0.9996 +x_0=1500000 +y_0=0 +ellps=intl +towgs84=-104.1,-49.1,-9.9,0.971,-2.917,0.714,-11.68 +units=m +no_defs +type=crs");
        proj4.defs("EPSG:3004", "+proj=tmerc +lat_0=0 +lon_0=15 +k=0.9996 +x_0=2520000 +y_0=0 +ellps=intl +towgs84=-104.1,-49.1,-9.9,0.971,-2.917,0.714,-11.68 +units=m +no_defs +type=crs");
    }

    var $_ = _ // keep pointer to underscore, as '_' will may be overridden by a closure variable when down the stack

    this.ckan.module('olpreview', function (jQuery, _) {

        ckan.geoview = ckan.geoview || {}

        var getParameterByName = function (name, url) {
            if (!url) url = window.location.href;
            name = name.replace(/[\[\]]/g, "\\$&");
            var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
                results = regex.exec(url);
            if (!results) return null;
            if (!results[2]) return null;
            return decodeURIComponent(results[2].replace(/\+/g, " "));
        };


        var esrirestExtractor = function(resource, proxyUrl, proxyServiceUrl, layerProcessor, map) {
            var parsedUrl = resource.url.split('#');
            var url = proxyServiceUrl || parsedUrl[0];

            var layerName = parsedUrl.length > 1 && parsedUrl[1];

            OL_HELPERS.withArcGisLayers(url, layerProcessor, layerName, parsedUrl[0]);
        }

        ckan.geoview.layerExtractors = {

            'kml': function (resource, proxyUrl, proxyServiceUrl, layerProcessor, map) {
                var url = proxyUrl || resource.url;
                layerProcessor(OL_HELPERS.createKMLLayer(url));
            },
            'gml': function (resource, proxyUrl, proxyServiceUrl, layerProcessor, map) {
                var url = proxyUrl || resource.url;
                layerProcessor(OL_HELPERS.createGMLLayer(url));
            },
            'geojson': function (resource, proxyUrl, proxyServiceUrl, layerProcessor, map) {
                var url = proxyUrl || resource.url;
                layerProcessor(OL_HELPERS.createGeoJSONLayer(url));
            },
            'wfs': function(resource, proxyUrl, proxyServiceUrl, layerProcessor, map) {
                var parsedUrl = resource.url.split('#');
                var url = proxyServiceUrl || parsedUrl[0];

                var ftName = parsedUrl.length > 1 && parsedUrl[1];

                // do a little more parsing here to get it from a longer url
                // what we want to do is add some extra parsing.
                // if there's a typename in the querystring, use that for ftName.
                if (!ftName) {
                    if (resource.url.toLowerCase().search('typename') !== -1) {
                        ftName = getParameterByName('typename', resource.url) || getParameterByName('TYPENAME', resource.url);
                    }
                }

                return OL_HELPERS.withFeatureTypesLayers(url, layerProcessor, ftName, map, true /* useGET */);
            },
            'wms' : function(resource, proxyUrl, proxyServiceUrl, layerProcessor, map) {
                var parsedUrl = resource.url.split('#');
                // use the original URL for the getMap, as there's no need for a proxy for image requests
                var getMapUrl = parsedUrl[0];

                var layerName = parsedUrl.length > 1 && parsedUrl[1];

                if (!layerName) {
                    if (resource.url.toLowerCase().search('layers') !== -1) {
                        layerName = getParameterByName('layers', resource.url) || getParameterByName('LAYERS', resource.url) || '';
                        layerName = layerName.split(':').reverse()[0];
                    }
                }

                var url = proxyServiceUrl || getMapUrl;

                return OL_HELPERS.withWMSLayers(url, getMapUrl, layerProcessor, layerName, true /* useTiling*/, map );
            },
            'wmts' : function(resource, proxyUrl, proxyServiceUrl, layerProcessor, map) {
                var parsedUrl = resource.url.split('#');

                var url = proxyServiceUrl || parsedUrl[0];

                var layerName = parsedUrl.length > 1 && parsedUrl[1];
                OL_HELPERS.withWMTSLayers(url, layerProcessor, layerName);
            },
            'esrigeojson': function (resource, proxyUrl, proxyServiceUrl, layerProcessor, map) {
                var url = proxyUrl || resource.url;
                layerProcessor(OL_HELPERS.createEsriGeoJSONLayer(url));
            },
            'arcgis_rest': esrirestExtractor ,
            'esri rest': esrirestExtractor ,
            'arcgis geoservices rest api': esrirestExtractor ,
            'gft': function (resource, proxyUrl, proxyServiceUrl, layerProcessor, map) {
                var tableId = OL_HELPERS.parseURL(resource.url).query.docid;
                layerProcessor(OL_HELPERS.createGFTLayer(tableId, ckan.geoview.gapi_key));
            }
        }

        // net7 patch: feedback when an OGC service is reachable but publishes
        // no layer for this resource (e.g. a WFS whose GetCapabilities lists
        // zero FeatureType). Without this, the map stays silently empty.
        var showEmptyServiceMessage = function () {
            if ($('#map-container > .geoview-empty-service').length) return;
            $('<div class="geoview-empty-service">' +
                'Il servizio non pubblica alcun layer visualizzabile.' +
                '</div>').prependTo('#map-container');
        }

        var withLayers = function (resource, proxyUrl, proxyServiceUrl, layerProcessor, map) {

            var extractor = ckan.geoview.layerExtractors[resource.format && resource.format.toLocaleLowerCase()];
            if (!extractor) return;

            var result = extractor(resource, proxyUrl, proxyServiceUrl, layerProcessor, map);

            // wfs/wms extractors return a jQuery deferred resolving with the
            // layers actually added; other extractors return nothing.
            if (result && typeof result.then === 'function') {
                result.then(function (layers) {
                    if (!layers || layers.length === 0) showEmptyServiceMessage();
                }, function () {
                    showEmptyServiceMessage();
                });
            }
        }

        return {
            options: {
                i18n: {
                }
            },

            initialize: function () {
                jQuery.proxyAll(this, /_on/);
                this.el.ready(this._onReady);
            },

            addLayer: function (resourceLayer) {

                if (ckan.geoview && ckan.geoview.feature_style) {
                    var styleMapJson = JSON.parse(ckan.geoview.feature_style)
                    /* TODO_OL4 how is stylemap converted to OL4 ? */
                    //resourceLayer.styleMap = new OpenLayers.StyleMap(styleMapJson)
                }

                if (this.options.ol_config.hide_overlays &&
                    this.options.ol_config.hide_overlays.toLowerCase() == "true") {
                    resourceLayer.setVisibility(false);
                }

                this.map.addLayerWithExtent(resourceLayer)
            },

            _commonBaseLayer: function(mapConfig, callback, module) {

                if (mapConfig.type == 'mapbox') {
                    // MapBox base map
                    if (!mapConfig['map_id'] || !mapConfig['access_token']) {
                      throw '[CKAN Map Widgets] You need to provide a map ID ([account].[handle]) and an access token when using a MapBox layer. ' +
                            'See http://www.mapbox.com/developers/api-overview/ for details';
                    }

                    mapConfig.url = ['//a.tiles.mapbox.com/v4/' + mapConfig['map_id'] + '/${z}/${x}/${y}.png?access_token=' + mapConfig['access_token'],
                                '//b.tiles.mapbox.com/v4/' + mapConfig['map_id'] + '/${z}/${x}/${y}.png?access_token=' + mapConfig['access_token'],
                                '//c.tiles.mapbox.com/v4/' + mapConfig['map_id'] + '/${z}/${x}/${y}.png?access_token=' + mapConfig['access_token'],
                                '//d.tiles.mapbox.com/v4/' + mapConfig['map_id'] + '/${z}/${x}/${y}.png?access_token=' + mapConfig['access_token'],
                    ];
                    mapConfig.attribution = '<a href="https://www.mapbox.com/about/maps/" target="_blank">&copy; Mapbox &copy; OpenStreetMap </a> <a href="https://www.mapbox.com/map-feedback/" target="_blank">Improve this map</a>';

                } else if (mapConfig.type == 'custom') {
                    mapConfig.type = 'XYZ'
                } else if (!mapConfig.type || mapConfig.type.toLowerCase() == 'osm') {
                    // default to Stamen base map
                    mapConfig.type = 'Stamen';
                    mapConfig.url = 'https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}.png';
                    mapConfig.subdomains = mapConfig.subdomains || 'abcd';
                    mapConfig.attribution = mapConfig.attribution || 'Map tiles by <a href="http://stamen.com">Stamen Design</a> (<a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>). Data by <a href="http://openstreetmap.org">OpenStreetMap</a> (<a href="http://creativecommons.org/licenses/by-sa/3.0">CC BY SA</a>)';
                }

                return OL_HELPERS.createLayerFromConfig(mapConfig, true, callback);
            },

            _onReady: function () {

                var baseMapsConfig = this.options.basemapsConfig

                // gather options and config for this view
                var proxyUrl = this.options.proxy_url;
                var proxyServiceUrl = this.options.proxy_service_url;

                if (this.options.resourceView)
                    $_.extend(ckan.geoview, JSON.parse(this.options.resourceView));

                ckan.geoview.gapi_key = this.options.gapi_key;

                var mapDiv = $("<div></div>").attr("id", "map").addClass("map")
                var info = $("<div></div>").attr("id", "info")
                mapDiv.append(info)

                $("#map-container").empty()
                $("#map-container").append(mapDiv)

                info.tooltip({
                    animation: false,
                    trigger: 'manual',
                    placement: "right",
                    html: true
                });

                var overlays = []
                if ((ckan.geoview && 'feature_hoveron' in ckan.geoview) ? ckan.geoview['feature_hoveron'] : this.options.ol_config.default_feature_hoveron)
                    overlays.push(new OL_HELPERS.FeatureInfoOverlay({
                        element: $("<div class='popupContainer'><div class='popupContent'></div></div>")[0],
                        autoPan: false,
                        offset: [5,5]
                    }))


                var createMapFun = function(baseMapLayer) {

                    var layerSwitcher = new ol.control.HilatsLayerSwitcher();

                    var coordinateFormatter = function(coordinate) {
                        var degrees = map && map.getView() && map.getView().getProjection() && (map.getView().getProjection().getUnits() == 'degrees')
                        return ol.coordinate.toStringXY(coordinate, degrees ? 5:2);
                    };

                    var options = {
                        target: $('.map')[0],
                        layers: [baseMapLayer],
                        controls: [
                            new ol.control.ZoomSlider(),
                            new ol.control.MousePosition( {
                                coordinateFormat: coordinateFormatter,
                            }),
                            layerSwitcher
                        ],
                        loadingDiv: false,
                        loadingListener: function(isLoading) {
                            layerSwitcher.isLoading(isLoading)
                        },
                        overlays: overlays,
                        view: new ol.View({
                            // projection attr should be set when creating a baselayer
                            projection: baseMapLayer.getSource().getProjection() || OL_HELPERS.Mercator,
                            extent: baseMapLayer.getExtent(), /* TODO_OL4 is this equivalent to maxExtent? */
                            //center: [0,0],
                            //zoom: 4
                        })
                    }

                    var map = this.map = new OL_HELPERS.LoggingMap(options);
                    // by default stretch the map to the basemap extent or to the world
                    map.getView().fit(
                            baseMapLayer.getExtent() || ol.proj.transformExtent(OL_HELPERS.WORLD_BBOX, OL_HELPERS.EPSG4326, map.getView().getProjection()),
                        {constrainResolution: false}
                    );

                    var highlighter = new ol.interaction.Select({
                        toggleCondition : function(evt) {return false},
                        multi: true,
                        condition: ol.events.condition.pointerMove
                    });
                    map.addInteraction(highlighter);

                    // force a reload of all vector sources on projection change
                    map.getView().on('change:projection', function() {
                        map.getLayers().forEach(function(layer) {
                            if (layer instanceof ol.layer.Vector) {
                                layer.getSource().clear();
                            }
                        });
                    });
                    map.on('change:view', function() {
                        map.getLayers().forEach(function(layer) {
                            if (layer instanceof ol.layer.Vector) {
                                layer.getSource().clear();
                            }
                        });
                    });

                    // net7 patch: GetFeatureInfo popup for queryable WMS layers.
                    // Raster WMS layers carry no client-side geometry, so the
                    // geo_view shows no popup on click. Here we query the server's
                    // GetFeatureInfo at the clicked coordinate and render the
                    // feature attributes in a dedicated overlay popup.
                    var wmsPopupEl = $("<div class='popupContainer wms-featureinfo'>" +
                        "<a href='#' class='wms-featureinfo-closer'>&times;</a>" +
                        "<div class='popupContent'></div></div>")[0];
                    var wmsPopup = new ol.Overlay({
                        element: wmsPopupEl,
                        autoPan: true,
                        offset: [8, 8]
                    });
                    map.addOverlay(wmsPopup);
                    $(wmsPopupEl).find('.wms-featureinfo-closer').on('click', function(e) {
                        e.preventDefault();
                        wmsPopup.setPosition(undefined);
                    });

                    var renderWMSFeatureInfo = function(contentType, data) {
                        // Return an HTML fragment for the popup, or null if there
                        // is no feature under the click.
                        if (data == null || data === '') return null;
                        if (contentType && contentType.toLowerCase().indexOf('json') !== -1) {
                            var json = (typeof data === 'string') ? JSON.parse(data) : data;
                            var feats = json && json.features;
                            if (!feats || feats.length === 0) return null;
                            var html = '';
                            feats.forEach(function(feat) {
                                var props = (feat && feat.properties) || {};
                                var keys = Object.keys(props);
                                if (keys.length === 0) return;
                                html += '<table class="wms-featureinfo-table">';
                                keys.forEach(function(k) {
                                    var v = props[k];
                                    html += '<tr><th>' + k + '</th><td>' +
                                        (v == null ? '' : ('' + v)) + '</td></tr>';
                                });
                                html += '</table>';
                            });
                            return html || null;
                        }
                        // text/html or text/plain: bail out when there is no real
                        // content (QGIS Server returns an (almost) empty document).
                        var text = ('' + data).trim();
                        if (text.replace(/<[^>]*>/g, '').trim().length === 0) return null;
                        return text;
                    };

                    map.on('singleclick', function(evt) {
                        var view = map.getView();
                        var resolution = view.getResolution();
                        var projection = view.getProjection();

                        var sources = [];
                        map.getLayers().forEach(function(layer) {
                            if (!layer.getVisible || !layer.getVisible()) return;
                            var source = layer.getSource && layer.getSource();
                            if (!source) return;
                            // OpenLayers 4.x exposes getGetFeatureInfoUrl; OL 6+
                            // renamed it to getFeatureInfoUrl. Support both. The
                            // presence of this method identifies a WMS source.
                            var fiFn = source.getGetFeatureInfoUrl || source.getFeatureInfoUrl;
                            if (typeof fiFn !== 'function') return;
                            // skip explicitly non-queryable layers
                            var descr = source.get('mlDescr');
                            if (descr && (descr.queryable === false ||
                                          descr.queryable === 0 ||
                                          descr.queryable === '0')) return;
                            sources.push(source);
                        });

                        if (sources.length === 0) return;

                        wmsPopup.setPosition(undefined);
                        var $content = $(wmsPopupEl).find('.popupContent').empty();
                        var pending = sources.length;
                        var anyContent = false;

                        var finalize = function() {
                            if (--pending > 0) return;
                            wmsPopup.setPosition(anyContent ? evt.coordinate : undefined);
                        };

                        sources.forEach(function(source) {
                            var fiFn = source.getGetFeatureInfoUrl || source.getFeatureInfoUrl;
                            var url = fiFn.call(source,
                                evt.coordinate, resolution, projection,
                                {
                                    'INFO_FORMAT': 'application/json',
                                    'FEATURE_COUNT': 10,
                                    // QGIS Server tolerances (in px): let clicks
                                    // near point/line features still hit them.
                                    // Ignored by other WMS servers.
                                    'FI_POINT_TOLERANCE': 10,
                                    'FI_LINE_TOLERANCE': 5,
                                    'FI_POLYGON_TOLERANCE': 5
                                });
                            if (!url) { finalize(); return; }
                            $.ajax({url: url, dataType: 'text'})
                                .done(function(data, status, xhr) {
                                    var ct = (xhr.getResponseHeader('Content-Type')) || 'application/json';
                                    var html = renderWMSFeatureInfo(ct, data);
                                    if (html) {
                                        anyContent = true;
                                        var title = source.get('name');
                                        $content.append(
                                            (title ? ('<div class="wms-featureinfo-title">' + title + '</div>') : '') +
                                            html);
                                    }
                                })
                                .always(finalize);
                        });
                    });


                    var fragMap = OL_HELPERS.parseKVP((window.parent || window).location.hash && (window.parent || window).location.hash.substring(1));

                    var bbox = fragMap.bbox && fragMap.bbox.split(',').map(parseFloat)
                    var bbox = bbox && ol.proj.transformExtent(bbox, OL_HELPERS.EPSG4326, this.map.getProjection());
                    if (bbox) this.map.zoomToExtent(bbox);

                    /* Update URL with current bbox
                    var $map = this.map;
                    var mapChangeListener = function() {
                        var newBbox = $map.getExtent() && $map.getExtent().transform($map.getProjectionObject(), OL_HELPERS.EPSG4326).toString()

                        if (newBbox) {
                            var fragMap = OL_HELPERS.parseKVP((window.parent || window).location.hash && (window.parent || window).location.hash.substring(1));
                            fragMap['bbox'] = newBbox;

                            (window.parent || window).location.hash = OL_HELPERS.kvp2string(fragMap)
                        }
                    }


                    // listen to bbox changes to update URL fragment
                    this.map.events.register("moveend", this.map, mapChangeListener);

                    this.map.events.register("zoomend", this.map, mapChangeListener);

                    */


                    var proxyUrl = this.options.proxy_url;
                    var proxyServiceUrl = this.options.proxy_service_url;

                    ckan.geoview.googleApiKey = this.options.gapi_key;


                    withLayers(preload_resource, proxyUrl, proxyServiceUrl, $_.bind(this.addLayer, this), this.map);
                }

                var $this = this;

                // Choose base map based on CKAN wide config

                if (!baseMapsConfig) {
                    // deprecated - for backward comp, parse old config format into json config
                    var config = {
                        type: this.options.map_config['type']
                    }
                    var prefix = config.type+'.'
                    for (var fieldName in this.options.map_config) {
                        if (fieldName.startsWith(prefix)) config[fieldName.substring(prefix.length)] = this.options.map_config[fieldName]
                    }
                    baseMapsConfig = [config]
                }

                this._commonBaseLayer(
                    baseMapsConfig[0],
                    function(layer) {
                        baseMapsConfig[0].$ol_layer = layer
                        $_.bind(createMapFun,$this)(layer)

                        // add all configured basemap layers
                        if (baseMapsConfig.length > 1) {
                            // add other basemaps if any
                            for (var idx=1;idx<baseMapsConfig.length;idx++) {
                                OL_HELPERS.createLayerFromConfig(
                                    baseMapsConfig[idx],
                                    true,
                                    function(layer) {
                                        layer.setVisible(false)
                                        // insert all basemaps at the bottom
                                        $this.map.getLayers().insertAt(0, layer)
                                    });
                            }
                        }
                    },
                    this);

            }
        }
    });
})();
