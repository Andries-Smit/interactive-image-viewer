define([
    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dojo/dom-style",
    "dojo/dom-construct",
    "dojo/_base/array",
    "dojo/_base/lang",
    "dojo/_base/event",
    "dojo/cookie",
    "dojo/query",
    "dojo/keys",
    "dojo/sniff",
    "dojo/text!ImageViewer/widget/ui/ImageViewer.html",
    "ImageViewer/widget/pixastic"
], function (declare, _WidgetBase, _TemplatedMixin, dojoStyle, dojoConstruct, dojoArray, lang, dojoEvent, cookie, query, dojoKeys, has, widgetTemplate) {
    "use strict";

    return declare("ImageViewer.widget.ImageViewer", [_WidgetBase, _TemplatedMixin], {
        templateString: widgetTemplate,

        // PARAMETERS
        viewerWidth: 400,
        viewerHeight: 400,
        maxZoomLevel: 6,
        minZoomLevel: 0,
        zoomDefault: "auto",
        useCookie: false,
        cookieExpire: 0,

        //IMPLEMENTATION
        imgNode: null,
        inverted: false,
        rotation: 0,
        dragok: false,
        contentDiv: null,
        currZoomLevel: 0,
        realWidth: 0,
        realHeight: 0,
        mouseDownEvent: null,
        scrollZoomEvt: null,
        scrollActive: false,
        activeEvents: null,
        keyEvt: null,
        fileID: "",

        postCreate: function () {
            this.activeEvents = [];
            // if (has("ie") > 0 && query(".imgViewerPixastic").length == 0) {
            //     document.getElementsByTagName("head")[0].appendChild(mendix.dom.script({ "class": "imgViewerPixastic", "src": "widgets/ImageViewer/widget/pixastic.js" }));
            // } else {
            //     dojo.require("ImageViewer.widget.pixastic");
            // }

            this.connect(this.rotateLeft, "onclick", lang.hitch(this, this.rotateImg, "left"));
            this.connect(this.rotateRight, "onclick", lang.hitch(this, this.rotateImg, "right"));
            this.connect(this.zoomInBtn, "onclick", lang.hitch(this, this.zoom, "in"));
            this.connect(this.zoomOutBtn, "onclick", lang.hitch(this, this.zoom, "out"));
            this.connect(this.invertBtn, "onclick", lang.hitch(this, this.invert));
            this.connect(this.scrollLockBtn, "onclick", lang.hitch(this, this.switchScroll));
            this.scrollZoomEvt = this.connect(this.contentDiv, (!has("mozilla") ? "onmousewheel" : "DOMMouseScroll"), lang.hitch(this, this.scrollEvent));
            this.mouseDownEvent = this.connect(this.imgNode, "onmousedown", lang.hitch(this, this.mouseDown));

            this.connect(this.domNode, "onfocus", lang.hitch(this, function () {
                this.disconnect(this.keyEvt);
                this.keyEvt = this.connect(this.domNode, "keypress", lang.hitch(this, this.keypressEvt));
            }));
            this.connect(this.domNode, "onblur", lang.hitch(this, function () {
                this.disconnect(this.keyEvt);
                this.keyEvt = null;
            }));

            // this.actRendered();
        },

        update: function (object, callback) {
            if (!!this.useCookie && this.imgNode && this.fileID && this.fileID != object.getGuid()) {
                this.setCookie();
            }

            if (this.fileID != (object.getGuid() + "")) {
                this.currZoomLevel = 0;
                this.scrollActive = false;
                this.rotation = 0;
                this.inverted = false;
                this.fileID = null;
                // dojoConstruct.empty(this.domNode);

                dojoArray.forEach(this.activeEvents, lang.hitch(this, function (evt) {
                    this.disconnect(evt);
                }));

                this.activeEvents = [];

                if (this.keyEvt) {
                    this.disconnect(this.keyEvt);
                }

                if (object.getGuid()) {
                    this.renderViewer(object);
                } else {
                    // TODO, should we clear the image when there is not context object?
                    logger.warn(this.id + ".applyContext received empty context");
                }
            }
            callback && callback();
        },

        renderViewer: function (obj) {
            if (!obj) {
                logger.error("Interactive Image Viewer: No object found.");
                return;
            }

            dojoStyle.set(this.domNode, {
                "width": "100%",
                "height": (this.viewerHeight + 15) + "px"
            });

            dojoStyle.set(this.contentDiv, {
                "overflow": "hidden",
                "width": "98%",
                "height": this.viewerHeight + "px",
                "position": "relative",
                "outline": "1px solid black"
            });
            if (has("ie")) {
                dojoStyle.set(this.contentDiv, "border", "1px solid black");
            }
            this.fileID = obj.getGuid() + "";

            this.imgNode.src = ""; // RvH: Chrome fix for new apply context, see http://code.google.com/p/chromium/issues/detail?id=7731
            this.imgNode.src = "file?target=window&guid=" + this.fileID;

            dojoStyle.set(this.imgNode, {
                "position": "relative",
                "cursor": "move"
            });

            this.activeEvents.push(this.connect(this.imgNode, "onload", lang.hitch(this, this.checkZoomDefault)));

            this.activeEvents.push(this.connect(this.imgNode, "onerror", lang.hitch(this, function () {
                logger.error("Interactive Image Viewer: Error loading image.");
                dojoConstruct.empty(this.domNode);
                dojoStyle.set(this.domNode, {
                    "width": "0px",
                    "height": "0px"
                });
                this.fileID = null;
            })));

            // RvH: IE doesn"t have an onload function, but this.imgNode.complete does reflect its status.
            // So we"ll just keep checking that until it"s ready...
            // IE9 should have an onload but this works just as fine.
            if (has("ie")) {
                mendix.lang.runOrDelay(
                    lang.hitch(this, this.checkZoomDefault),
                    lang.hitch(this, function () {
                        return this.imgNode.complete;
                    })
                );
            }
        },

        loadCookie: function () {
            if (this.useCookie) {
                var cookieName = mx.session.getUserId() + "";
                if (cookie(cookieName)) {
                    var contentFound = JSON.parse(cookie(cookieName));
                    if (this.fileID && contentFound.hasOwnProperty(this.fileID)) {
                        var content = contentFound[this.fileID];
                        if (content.zoom > 0) {
                            for (var i = 0; i < content.zoom; i++)
                                this.zoom("in");
                        } else if (content.zoom < 0) {
                            for (var i = content.zoom; i < 0; i++) {
                                this.zoom("out");
                            }
                        }
                        if (content.rotate) {
                            this.rotation = content.rotate;
                            this.applyRotate();
                        }
                        if (content.invert && content.invert == true) {
                            this.invert();
                        }
                        dojoStyle.set(this.imgNode, {
                            left: content.left,
                            top: content.top
                        });
                    }
                }
            }
        },

        keypressEvt: function (e) {
            var offsetW = (this.imgNode.offsetWidth / this.contentDiv.offsetWidth) * 30;
            var offsetH = (this.imgNode.offsetHeight / this.contentDiv.offsetHeight) * 30;
            switch (e.keyCode) {
                case dojoKeys.LEFT_ARROW:
                    dojoStyle.set(this.imgNode, {
                        "left": this.checkPos(this.imgNode, dojoStyle.get(this.imgNode, "left") + offsetW, "left")
                    });
                    e.preventDefault();
                    break;
                case dojoKeys.RIGHT_ARROW:
                    dojoStyle.set(this.imgNode, {
                        "left": this.checkPos(this.imgNode, dojoStyle.get(this.imgNode, "left") - offsetW, "left")
                    });
                    e.preventDefault();
                    break;
                case dojoKeys.UP_ARROW:
                    dojoStyle.set(this.imgNode, {
                        "top": this.checkPos(this.imgNode, dojoStyle.get(this.imgNode, "top") + offsetH, "top")
                    });
                    e.preventDefault();
                    break;
                case dojoKeys.DOWN_ARROW:
                    dojoStyle.set(this.imgNode, {
                        "top": this.checkPos(this.imgNode, dojoStyle.get(this.imgNode, "top") - offsetH, "top")
                    });
                    e.preventDefault();
                    break;
                default:
                    break;
            }
        },

        checkZoomDefault: function () {
            this.realWidth = this.imgNode.offsetWidth;
            this.realHeight = this.imgNode.offsetHeight;

            switch (this.zoomDefault) {
                case "fill":
                    if (this.imgNode.offsetWidth >= this.imgNode.offsetHeight) {
                        dojoStyle.set(this.imgNode, {
                            "width": this.viewerWidth + "px",
                            "height": (this.viewerWidth / this.imgNode.offsetWidth) * this.imgNode.offsetHeight + "px"
                        });
                    } else {
                        dojoStyle.set(this.imgNode, {
                            "width": (this.viewerHeight / this.imgNode.offsetHeight) * this.imgNode.offsetWidth + "px",
                            "height": this.viewerHeight + "px"
                        });
                    }
                    break;
                case "stretch":
                    dojoStyle.set(this.imgNode, {
                        "width": this.viewerWidth + "px",
                        "height": this.viewerHeight + "px"
                    });
                    break;
                case "auto":
                default:
                    break;
            }
            this.currZoomLevel = 0;
            setTimeout(lang.hitch(this, this.loadCookie), 1);
        },

        mouseDown: function (e) {
            if (!e) {
                e = window.event;
            }
            this.domNode.focus();
            this.dragok = true;
            var dx = parseInt(dojoStyle.get(this.imgNode, "left") + 0);
            var dy = parseInt(dojoStyle.get(this.imgNode, "top") + 0);
            var x = e.clientX;
            var y = e.clientY;
            this.moveEvent = this.connect(document, "onmousemove", lang.hitch(this, this.mouseMove, this.imgNode, dx, dy, x, y)) + "px";
            this.upEvent = this.connect(document, "onmouseup", lang.hitch(this, this.mouseUp)) + "px";

            e.preventDefault();
            return false;
        },

        mouseUp: function (e) {
            this.dragok = false;
            //this.disconnect(this.moveEvent);
            //this.disconnect(this.upEvent);
            e.preventDefault();
            e.stopPropagation();
            return false;
        },

        mouseMove: function (d, dx, dy, x, y, e) {
            if (!e) {
                e = window.event;
            }
            if (this.dragok) {
                dojoStyle.set(d, {
                    "left": this.checkPos(d, dx + e.clientX - x, "left") + "px",
                    "top": this.checkPos(d, dy + e.clientY - y, "top") + "px"
                });
            }
            e.preventDefault();
            e.stopPropagation();
            return false;
        },

        switchScroll: function () {
            if (this.scrollActive == false) {
                this.scrollLockBtn.src = "widgets/ImageViewer/widget/ui/scroll_lock.png";
                this.scrollLockBtn.title = "Enable scroll zoom";
                this.disconnect(this.scrollZoomEvt);
                this.scrollZoomEvt = this.connect(this.contentDiv, (!has("mozilla") ? "onmousewheel" : "DOMMouseScroll"), lang.hitch(this, this.scrollUpDown));
                this.scrollActive = true;

                if (!!this.useCookie) {
                    this.setCookie();
                }
            } else {
                this.scrollLockBtn.src = "widgets/ImageViewer/widget/ui/scroll_open.png";
                this.scrollLockBtn.title = "Disable scroll zoom";
                this.disconnect(this.scrollZoomEvt);
                this.scrollZoomEvt = this.connect(this.contentDiv, (!has("mozilla") ? "onmousewheel" : "DOMMouseScroll"), lang.hitch(this, this.scrollEvent));
                this.scrollActive = false;
            }
        },

        scrollUpDown: function (evt) {
            var scroll = evt[(!has("mozilla") ? "wheelDelta" : "detail")] * (!has("mozilla") ? 1 : -1);
            var scrollInc = this.viewerHeight / 8;
            if (scroll > 0) {
                dojoStyle.set(this.imgNode, {
                    "top": this.checkPos(this.imgNode, (dojoStyle.get(this.imgNode, "top") + scrollInc), "top")
                });
            } else {
                dojoStyle.set(this.imgNode, {
                    "top": this.checkPos(this.imgNode, (dojoStyle.get(this.imgNode, "top") - scrollInc), "top")
                });
            }
            evt.preventDefault();
            evt.stopPropagation();
            return false;
        },

        scrollEvent: function (evt) {
            var scroll = evt[(!has("mozilla") ? "wheelDelta" : "detail")] * (!has("mozilla") ? 1 : -1);
            this.zoom((scroll > 0) ? "in" : "out");
            evt.preventDefault();
            evt.stopPropagation();
        },

        checkPos: function (node, pos, dir) {
            var newValue = pos;
            var nodeVal, contentVal, offset = 0;

            if (this.rotation == 90 || this.rotation == 270) {
                if (dir == "left") {
                    contentVal = this.contentDiv.offsetWidth;
                    nodeVal = (has("ie")) ? node.offsetWidth : node.offsetHeight;
                    offset = (has("ie")) ? 0 : (node.offsetWidth - node.offsetHeight) / 2;
                } else {
                    contentVal = this.contentDiv.offsetHeight;
                    nodeVal = (has("ie")) ? node.offsetHeight : node.offsetWidth;
                    offset = (has("ie")) ? 0 : (node.offsetHeight - node.offsetWidth) / 2;
                }
            } else {
                if (dir == "left") {
                    contentVal = this.contentDiv.offsetWidth;
                    nodeVal = node.offsetWidth;
                } else {
                    contentVal = this.contentDiv.offsetHeight;
                    nodeVal = node.offsetHeight;
                }
            }
            if (nodeVal < contentVal) {
                if (pos < -offset) {
                    newValue = -offset;
                } else if (pos > (contentVal - nodeVal) - offset) {
                    newValue = (contentVal - nodeVal) - offset;
                }
            } else {
                if (pos >= -offset) {
                    newValue = -offset;
                } else if ((pos + nodeVal) < (contentVal - offset)) {
                    newValue = (contentVal - nodeVal) - offset;
                }
            }
            return Math.round(newValue);
        },

        invert: function () {
            if (this.imgNode == null) {
                this.imgNode = query("canvas", this.domNode)[0];
            }

            this.inverted = !this.inverted;
            var currWidth = this.imgNode.offsetWidth;
            var currHeight = this.imgNode.offsetHeight;
            if (has("ie")) {
                var filter = 0;
                switch (this.rotation) {
                    case 90: filter = 1;
                        break;
                    case 180: filter = 2;
                        break;
                    case 270: filter = 3;
                        break;
                    default: filter = 0;
                }
                dojoStyle.set(this.imgNode, {
                    "filter": ((this.inverted) ? "invert " : "") + "progid:DXImageTransform.Microsoft.BasicImage(rotation=" + filter + ")"
                });
            } else {
                if (currWidth > 0 && currHeight > 0 && this.realWidth > 0 && this.realHeight > 0) {
                    dojoStyle.set(this.imgNode, {
                        "width": this.realWidth,
                        "height": this.realHeight
                    });
                }
                var newNode = null;

                newNode = Pixastic.process(this.imgNode, "invert");
                this.imgNode = query("canvas", this.domNode)[0];

                if (!!newNode) {
                    this.imgNode = newNode;
                }

                if (currWidth > 0 && currHeight > 0 && this.realWidth > 0 && this.realHeight > 0)
                    dojoStyle.set(this.imgNode, {
                        "width": currWidth,
                        "height": currHeight
                    });
                this.mouseDownEvent && this.disconnect(this.mouseDownEvent);
                this.mouseDownEvent = this.connect(this.imgNode, "onmousedown", lang.hitch(this, this.mouseDown));
            }
        },

        rotateImg: function (dir) {
            if (dir == "left") {
                this.rotation -= 90;
            } else {
                this.rotation += 90;
            }
            if (this.rotation >= 360) {
                this.rotation = 360 - this.rotation;
            }
            if (this.rotation < 0) {
                this.rotation = 360 + this.rotation;
            }

            this.applyRotate(this.rotation);
        },

        applyRotate: function () {
            var filter = 0;
            switch (this.rotation) {
                case 90: filter = 1;
                    break;
                case 180: filter = 2;
                    break;
                case 270: filter = 3;
                    break;
                default: filter = 0;
            }
            dojoStyle.set(this.imgNode, {
                "MozTransform": "rotate(" + this.rotation + "deg)",
                "WebkitTransform": "rotate(" + this.rotation + "deg)",
                "OTransform": "rotate(" + this.rotation + "deg)",
                "filter": ((this.inverted) ? "invert " : "") + "progid:DXImageTransform.Microsoft.BasicImage(rotation=" + filter + ")"
            });
            dojoStyle.set(this.imgNode, {
                "left": this.checkPos(this.imgNode, dojoStyle.get(this.imgNode, "left"), "left"),
                "top": this.checkPos(this.imgNode, dojoStyle.get(this.imgNode, "top"), "top")
            });
        },

        zoom: function (inOut) {
            var oldW = dojoStyle.get(this.imgNode, "width");
            var oldH = dojoStyle.get(this.imgNode, "height");
            var oldLeft = dojoStyle.get(this.imgNode, "left");
            var oldTop = dojoStyle.get(this.imgNode, "top");

            var baseX = (this.viewerWidth) / 2;
            var baseY = (this.viewerHeight) / 2;

            if (inOut == "in") {
                if (this.currZoomLevel < this.maxZoomLevel) {
                    this.currZoomLevel++;
                    dojoStyle.set(this.imgNode, {
                        "width": (oldW * 1.25) + "px",
                        "height": (oldH * 1.25) + "px"
                    });
                    dojoStyle.set(this.imgNode, {
                        "left": this.checkPos(this.imgNode, baseX - ((baseX - oldLeft) * 1.25), "left") + "px",
                        "top": this.checkPos(this.imgNode, baseY - ((baseY - oldTop) * 1.25), "top") + "px"
                    });
                }
            } else {
                if ((this.minZoomLevel == 0) || (this.currZoomLevel > this.minZoomLevel)) {
                    this.currZoomLevel--;
                    dojoStyle.set(this.imgNode, {
                        "width": (oldW / 1.25) + "px",
                        "height": (oldH / 1.25) + "px"
                    });
                    dojoStyle.set(this.imgNode, {
                        "left": this.checkPos(this.imgNode, baseX - ((baseX - oldLeft) / 1.25), "left") + "px",
                        "top": this.checkPos(this.imgNode, baseY - ((baseY - oldTop) / 1.25), "top") + "px"
                    });
                }
            }
        },

        setCookie: function () {
            try {
                var name = mx.session.getUserId() + "";
                var fileid = this.fileID;
                var contents = {};
                if (cookie(name)) {
                    contents = JSON.parse(cookie(name));
                }
                if (fileid) {
                    var left = dojoStyle.get(this.imgNode, "left");
                    var top = dojoStyle.get(this.imgNode, "top");
                    contents[fileid] = {
                        zoom: this.currZoomLevel,
                        left: left,
                        top: top,
                        rotate: this.rotation || 0,
                        invert: this.inverted || false
                    };
                    cookie(name, JSON.stringify(contents), { expires: this.cookieExpire || 1 });
                }
            } catch (e) {
                logger.error("Problem in Interactive Image Viewer : setCookie.", e);
            }
        },

        uninitialize: function () {
            if (this.useCookie) {
                this.setCookie();
            }

            if (this.keyEvt) {
                this.disconnect(this.keyEvt);
            }
        }
    });
});
