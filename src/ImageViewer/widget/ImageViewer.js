dojo.provide("ImageViewer.widget.ImageViewer");

mendix.widget.declare('ImageViewer.widget.ImageViewer', {
	addons       : [dijit._Templated],
    inputargs: {
        
		viewerWidth : 400,
		viewerHeight : 400,
		maxZoomLevel : 6,
		minZoomLevel : 0,
		zoomDefault : 'auto',
		useCookie : false,
		cookieExpire : 0
        
    },
	
	templatePath : dojo.moduleUrl("ImageViewer.widget", "ui/ImageViewer.html"),
	
	//IMPLEMENTATION
	imgNode : null,
	inverted : false,
	rotation : 0,
	dragok : false,
	contentDiv : null,
	currZoomLevel : 0,
	realWidth : 0,
	realHeight : 0,
	mouseDownEvent : null,
	scrollZoomEvt : null,
	scrollActive : false,
	activeEvents : null,
	keyEvt : null,
	fileID : '',
	
	postCreate : function() {
		this.activeEvents = [];
		if (dojo.isIE > 0 && dojo.query('.imgViewerPixastic').length == 0)
			document.getElementsByTagName("head")[0].appendChild(mendix.dom.script({'class' : 'imgViewerPixastic', 'src' : 'widgets/ImageViewer/widget/pixastic.js'}));
		else
			dojo.require("ImageViewer.widget.pixastic");
		
		this.connect(this.rotateLeft, 'onclick', dojo.hitch(this, this.rotateImg, 'left'));
		this.connect(this.rotateRight, 'onclick', dojo.hitch(this, this.rotateImg, 'right'));
		this.connect(this.zoomInBtn, 'onclick', dojo.hitch(this, this.zoom, 'in'));
		this.connect(this.zoomOutBtn, 'onclick', dojo.hitch(this, this.zoom, 'out'));
		this.connect(this.invertBtn, 'onclick', dojo.hitch(this, this.invert));
		this.connect(this.scrollLockBtn, 'onclick', dojo.hitch(this, this.switchScroll));
		this.scrollZoomEvt = this.connect(this.contentDiv, (!dojo.isMozilla ? "onmousewheel" : "DOMMouseScroll"), dojo.hitch(this, this.scrollEvent));
		this.mouseDownEvent = this.connect(this.imgNode, 'onmousedown', dojo.hitch(this, this.mouseDown));
		
		this.connect(this.domNode, 'onfocus', dojo.hitch(this, function () {
			this.disconnect(this.keyEvt);
			this.keyEvt = this.connect(this.domNode, 'keypress', dojo.hitch(this, this.keypressEvt));
		}));
		this.connect(this.domNode, 'onblur', dojo.hitch(this, function () {
			this.disconnect(this.keyEvt);
			this.keyEvt = null;
		}));
		
		this.actRendered();
	},
    
    applyContext : function(context, callback){
		if (!!this.useCookie && this.imgNode && this.fileID && this.fileID != context.getActiveGUID())
			this.setCookie();
		
		if (this.fileID != (context.getActiveGUID()+'')) {
			this.currZoomLevel = 0;
			this.scrollActive = false;
			this.rotation = 0;
			this.inverted = false;
			this.fileID = null;
			//dojo.empty(this.domNode);
			
			dojo.forEach(this.activeEvents, dojo.hitch(this, function (evt) {
				this.disconnect(evt);
			}));
			
			this.activeEvents = [];
			
			if (this.keyEvt)
				this.disconnect(this.keyEvt);
			
			if (context && context.getActiveGUID())
				mx.processor.getObject(context.getActiveGUID(), dojo.hitch(this, this.renderViewer));
			else
				logger.warn(this.id + ".applyContext received empty context");
		}
		callback && callback();
	},
	
	renderViewer : function (obj) {
		if (!obj) {
			logger.error('Interactive Image Viewer: No object found.');
			return;
		}
		
		dojo.style(this.domNode, {
			'width' : '100%',
			'height' : (this.viewerHeight+15)+'px'
		});
		
		dojo.style(this.contentDiv, {
			'overflow' : 'hidden',
			'width' : '98%',
			'height' : this.viewerHeight+'px',
			'position' : 'relative',
			'outline' : '1px solid black'
		});
		if (dojo.isIE)
			dojo.style(this.contentDiv, 'border', '1px solid black');
		
		this.fileID = obj.getGUID()+'';
		
		this.imgNode.src = ""; // RvH: Chrome fix for new apply context, see http://code.google.com/p/chromium/issues/detail?id=7731
		this.imgNode.src = 'file?target=window&guid='+this.fileID;
		
		dojo.style(this.imgNode, {
			'position' : 'relative',
			'cursor' : 'move'
		});
		
		this.activeEvents.push(this.connect(this.imgNode, 'onload', dojo.hitch(this, this.checkZoomDefault)));
		
		this.activeEvents.push(this.connect(this.imgNode, 'onerror',  dojo.hitch(this, function () {
			logger.error("Interactive Image Viewer: Error loading image.");
			dojo.empty(this.domNode);
			dojo.style(this.domNode, {
				'width' : '0px',
				'height' : '0px'
			});
			this.fileID = null;
		})));
		
		// RvH: IE doesn't have an onload function, but this.imgNode.complete does reflect its status.
		// So we'll just keep checking that until it's ready...
		// IE9 should have an onload but this works just as fine.
		if (dojo.isIE)
			mendix.lang.runOrDelay(
				dojo.hitch(this, this.checkZoomDefault),
				dojo.hitch(this, function () {
					return this.imgNode.complete;
				})
			);
	},
	
	loadCookie : function () {
		if (this.useCookie) {
			var cookieName = mx.session.getUserId()+'';
			if (dojo.cookie(cookieName)) {
				var contentFound = dojo.fromJson(dojo.cookie(cookieName));
				if (this.fileID && contentFound.hasOwnProperty(this.fileID)) {
					var content = contentFound[this.fileID];
					if (content.zoom > 0) {
						for (var i = 0; i < content.zoom; i++)
							this.zoom('in');
					} else if (content.zoom < 0) {
						for (var i = content.zoom; i < 0; i++)
							this.zoom('out');
					}
					if (content.rotate) {
						this.rotation = content.rotate;
						this.applyRotate();
					}
					if (content.invert && content.invert == true) {
						this.invert();
					}
					dojo.style(this.imgNode, {
						left : content.left,
						top : content.top
					});
				}
			}
		}
	},
	
	keypressEvt : function (e) {
		var offsetW = (this.imgNode.offsetWidth/this.contentDiv.offsetWidth)*30;
		var offsetH = (this.imgNode.offsetHeight/this.contentDiv.offsetHeight)*30;
		switch (e.keyCode) {
			case dojo.keys.LEFT_ARROW :
				dojo.style(this.imgNode, {
					'left' : this.checkPos(this.imgNode, dojo.style(this.imgNode, 'left')+offsetW, 'left')
				});
				e.preventDefault();
				break;
			case dojo.keys.RIGHT_ARROW :
				dojo.style(this.imgNode, {
					'left' : this.checkPos(this.imgNode, dojo.style(this.imgNode, 'left')-offsetW, 'left')
				});
				e.preventDefault();
				break;
			case dojo.keys.UP_ARROW :
				dojo.style(this.imgNode, {
					'top' : this.checkPos(this.imgNode, dojo.style(this.imgNode, 'top')+offsetH, 'top')
				});
				e.preventDefault();
				break;
			case dojo.keys.DOWN_ARROW :
				dojo.style(this.imgNode, {
					'top' : this.checkPos(this.imgNode, (dojo.style(this.imgNode, 'top')-offsetH), 'top')
				});
				e.preventDefault();
				break;
			default :
				break;
		}
	},
	
	checkZoomDefault : function () {
		this.realWidth = this.imgNode.offsetWidth;
		this.realHeight = this.imgNode.offsetHeight;
		
		switch (this.zoomDefault) {
			case 'fill' :
				if (this.imgNode.offsetWidth >= this.imgNode.offsetHeight) {
					dojo.style(this.imgNode, {
						'width' : this.viewerWidth+'px',
						'height' : (this.viewerWidth/this.imgNode.offsetWidth)*this.imgNode.offsetHeight+'px'
					});
				} else {
					dojo.style(this.imgNode, {
						'width' : (this.viewerHeight/this.imgNode.offsetHeight)*this.imgNode.offsetWidth+'px',
						'height' : this.viewerHeight+'px'
					});
				}
				break;
			case 'stretch' :
				dojo.style(this.imgNode, {
					'width' : this.viewerWidth+'px',
					'height' : this.viewerHeight+'px'
				});
				break;
			case 'auto' :
			default :
				break;
		}
		this.currZoomLevel = 0;
		setTimeout(dojo.hitch(this, this.loadCookie), 1);
	},
	
	mouseDown : function (e) {
		if (!e) e = window.event;
		this.domNode.focus();
		this.dragok = true;
		dx = parseInt(dojo.style(this.imgNode, 'left')+0);
		dy = parseInt(dojo.style(this.imgNode, 'top')+0);
		x = e.clientX;
		y = e.clientY;
		this.moveEvent = this.connect(document, 'onmousemove', dojo.hitch(this, this.mouseMove, this.imgNode, dx, dy, x, y))+"px";
		this.upEvent = this.connect(document, 'onmouseup', dojo.hitch(this, this.mouseUp))+"px";
		
		e.preventDefault();
		return false;
	},
	
	mouseUp : function (e) {
		this.dragok = false;
		//this.disconnect(this.moveEvent);
		//this.disconnect(this.upEvent);
		e.preventDefault();
		e.stopPropagation();
		return false;
	},
	
	mouseMove : function (d, dx, dy, x, y, e) {
		if (!e) e = window.event;
		if (this.dragok) {
			dojo.style(d, {
				'left' : this.checkPos(d, dx + e.clientX - x, 'left')+"px",
				'top' : this.checkPos(d, dy + e.clientY - y, 'top')+"px"
			});
		}
		e.preventDefault();
		e.stopPropagation();
		return false;
	},
	
	switchScroll : function () {
		if (this.scrollActive == false) {
			this.scrollLockBtn.src = 'widgets/ImageViewer/widget/ui/scroll_lock.png';
			this.scrollLockBtn.title = 'Enable scroll zoom';
			this.disconnect(this.scrollZoomEvt);
			this.scrollZoomEvt = this.connect(this.contentDiv, (!dojo.isMozilla ? "onmousewheel" : "DOMMouseScroll"), dojo.hitch(this, this.scrollUpDown));
			this.scrollActive = true;
			
			if(!!this.useCookie)
				this.setCookie();
		} else {
			this.scrollLockBtn.src = 'widgets/ImageViewer/widget/ui/scroll_open.png';
			this.scrollLockBtn.title = 'Disable scroll zoom';
			this.disconnect(this.scrollZoomEvt);
			this.scrollZoomEvt = this.connect(this.contentDiv, (!dojo.isMozilla ? "onmousewheel" : "DOMMouseScroll"), dojo.hitch(this, this.scrollEvent));
			this.scrollActive = false;
		}
	},
	
	scrollUpDown : function (evt) {
		var scroll = evt[(!dojo.isMozilla ? "wheelDelta" : "detail")] * (!dojo.isMozilla ? 1 : -1);
		var scrollInc = this.viewerHeight/8;
		if (scroll > 0) {
			dojo.style(this.imgNode, {
				'top' : this.checkPos(this.imgNode, (dojo.style(this.imgNode, 'top')+scrollInc), 'top')
			});
		} else {
			dojo.style(this.imgNode, {
				'top' : this.checkPos(this.imgNode, (dojo.style(this.imgNode, 'top')-scrollInc), 'top')
			});
		}
		evt.preventDefault();
		evt.stopPropagation();
		return false;
	},
	
	scrollEvent : function (evt) {
		var scroll = evt[(!dojo.isMozilla ? "wheelDelta" : "detail")] * (!dojo.isMozilla ? 1 : -1);
		this.zoom((scroll > 0)?'in':'out');
		evt.preventDefault();
		evt.stopPropagation();
	},
	
	checkPos : function (node, pos, dir) {
		var newValue = pos;
		var nodeVal, contentVal, offset = 0;
		
		if (this.rotation == 90 || this.rotation == 270) {
			if (dir == 'left') {
				contentVal = this.contentDiv.offsetWidth;
				nodeVal = (dojo.isIE)?node.offsetWidth:node.offsetHeight;
				offset = (dojo.isIE)?0:(node.offsetWidth - node.offsetHeight)/2;
			} else {
				contentVal = this.contentDiv.offsetHeight;
				nodeVal = (dojo.isIE)?node.offsetHeight:node.offsetWidth;
				offset = (dojo.isIE)?0:(node.offsetHeight - node.offsetWidth)/2;
			}
		} else {
			if (dir == 'left') {
				contentVal = this.contentDiv.offsetWidth;
				nodeVal = node.offsetWidth;
			} else {
				contentVal = this.contentDiv.offsetHeight;
				nodeVal = node.offsetHeight;
			}
		}
		if (nodeVal < contentVal) {
			if (pos < -offset)
				newValue = -offset;
			else if (pos > (contentVal-nodeVal)-offset)
				newValue = (contentVal-nodeVal)-offset;
		} else {
			if (pos >= -offset)
				newValue = -offset;
			else if ((pos + nodeVal) < (contentVal-offset))
				newValue = (contentVal - nodeVal)-offset;
		}
		return Math.round(newValue);
	},
	
	invert : function () {
		if (this.imgNode == null)
			this.imgNode = dojo.query('canvas', this.domNode)[0];
	
		this.inverted = !this.inverted;
		var currWidth = this.imgNode.offsetWidth;
		var currHeight = this.imgNode.offsetHeight;
		if (dojo.isIE) {
			var filter = 0;
			switch(this.rotation) {
				case 90: filter = 1;
					break;
				case 180: filter = 2;
					break;
				case 270: filter = 3;
					break;
				default : filter = 0;
			}
			dojo.style(this.imgNode, {
				'filter' :((this.inverted)?'invert ':'')+'progid:DXImageTransform.Microsoft.BasicImage(rotation='+filter+')'
			});
		} else {
			if (currWidth > 0 && currHeight > 0 && this.realWidth > 0 && this.realHeight > 0)
				dojo.style(this.imgNode, {
					'width' : this.realWidth,
					'height' : this.realHeight
				});
				
			var newNode = null;
			
			newNode = Pixastic.process(this.imgNode, 'invert');
			this.imgNode = dojo.query('canvas', this.domNode)[0];
			
			if (!!newNode)
				this.imgNode = newNode;
			
			if (currWidth > 0 && currHeight > 0 && this.realWidth > 0 && this.realHeight > 0)
				dojo.style(this.imgNode, {
					'width' : currWidth,
					'height' : currHeight
				});
			this.mouseDownEvent && this.disconnect(this.mouseDownEvent);
			this.mouseDownEvent = this.connect(this.imgNode, 'onmousedown', dojo.hitch(this, this.mouseDown));
			
		}
	},
	
	rotateImg : function (dir) {
		if (dir == 'left')
			this.rotation -= 90;
		else
			this.rotation += 90;
		
		if (this.rotation >= 360)
			this.rotation = 360 - this.rotation;
			
		if (this.rotation < 0)
			this.rotation = 360 + this.rotation;
		
		this.applyRotate(this.rotation);
	},
	
	applyRotate : function () {
		var filter = 0;
		switch(this.rotation) {
			case 90: filter = 1;
				break;
			case 180: filter = 2;
				break;
			case 270: filter = 3;
				break;
			default : filter = 0;
		}
		dojo.style(this.imgNode, {
			'MozTransform' : 'rotate('+this.rotation+'deg)',
			'WebkitTransform' : 'rotate('+this.rotation+'deg)',
			'OTransform' : 'rotate('+this.rotation+'deg)',
			'filter' :((this.inverted)?'invert ':'')+'progid:DXImageTransform.Microsoft.BasicImage(rotation='+filter+')'
		});
		dojo.style(this.imgNode, {
			'left' : this.checkPos(this.imgNode, dojo.style(this.imgNode, 'left'), 'left'),
			'top' : this.checkPos(this.imgNode, dojo.style(this.imgNode, 'top'), 'top')
		});
	},
	
	zoom : function (inOut) {
		var oldW = dojo.style(this.imgNode, 'width');
		var oldH = dojo.style(this.imgNode, 'height');
		var oldLeft = dojo.style(this.imgNode, 'left');
		var oldTop = dojo.style(this.imgNode, 'top');
		
		var baseX = (this.viewerWidth)/2;
		var baseY = (this.viewerHeight)/2;
		
		if (inOut == 'in') {
			if (this.currZoomLevel < this.maxZoomLevel) {
				this.currZoomLevel++;
				dojo.style(this.imgNode, {
					'width' : (oldW * 1.25)+"px",
					'height' : (oldH * 1.25)+"px"
				});
				dojo.style(this.imgNode, {
					'left' : this.checkPos(this.imgNode, baseX - ((baseX - oldLeft)*1.25), 'left')+"px",
					'top' : this.checkPos(this.imgNode, baseY - ((baseY - oldTop)*1.25), 'top')+"px"
				});
			}
		} else {
			if ((this.minZoomLevel == 0) || (this.currZoomLevel > this.minZoomLevel)) {
				this.currZoomLevel--;
				dojo.style(this.imgNode, {
					'width' : (oldW / 1.25)+"px",
					'height' : (oldH / 1.25)+"px"
				});
				dojo.style(this.imgNode, {
					'left' : this.checkPos(this.imgNode, baseX - ((baseX - oldLeft)/1.25), 'left')+"px",
					'top' : this.checkPos(this.imgNode, baseY - ((baseY - oldTop)/1.25), 'top')+"px"
				});
			}
		}
	},
	
	setCookie : function () {
		try {
			var name = mx.session.getUserId()+'';
			var fileid = this.fileID;
			var contents = {};
			if (dojo.cookie(name)) {
				contents = dojo.fromJson(dojo.cookie(name));
			}
			if (fileid) {
				var left = dojo.style(this.imgNode, 'left');
				var top = dojo.style(this.imgNode, 'top');
				contents[fileid] = {
					zoom : this.currZoomLevel,
					left : left,
					top : top,
					rotate : this.rotation || 0,
					invert : this.inverted || false
				};
				dojo.cookie(name, dojo.toJson(contents), { expires : this.cookieExpire || 1 });
			}
		} catch (e) {
			logger.error("Problem in Interactive Image Viewer : setCookie.",e);
		}
	},
	
	uninitialize : function(){
		if(this.useCookie)
			this.setCookie();
		
		if (this.keyEvt)
			this.disconnect(this.keyEvt);
	}
});
