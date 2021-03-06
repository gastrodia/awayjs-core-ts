///<reference path="../../_definitions.ts"/>

module away.net
{
	/**
	 * Dispatched when any asset finishes parsing. Also see specific events for each
	 * individual asset type (meshes, materials et c.)
	 *
	 * @eventType away.events.AssetEvent
	 */
	//[Event(name="assetComplete", type="away3d.events.AssetEvent")]


	/**
	 * Dispatched when a full resource (including dependencies) finishes loading.
	 *
	 * @eventType away.events.LoaderEvent
	 */
	//[Event(name="resourceComplete", type="away3d.events.LoaderEvent")]


	/**
	 * Dispatched when a single dependency (which may be the main file of a resource)
	 * finishes loading.
	 *
	 * @eventType away.events.LoaderEvent
	 */
	//[Event(name="dependencyComplete", type="away3d.events.LoaderEvent")]


	/**
	 * Dispatched when an error occurs during loading. I
	 *
	 * @eventType away.events.LoaderEvent
	 */
	//[Event(name="loadError", type="away3d.events.LoaderEvent")]


	/**
	 * Dispatched when an error occurs during parsing.
	 *
	 * @eventType away.events.ParserEvent
	 */
	//[Event(name="parseError", type="away3d.events.ParserEvent")]

	/**
	 * Dispatched when an image asset dimensions are not a power of 2
	 *
	 * @eventType away.events.AssetEvent
	 */
	//[Event(name="textureSizeError", type="away3d.events.AssetEvent")]

	/**
	 * AssetLoader can load any file format that away.supports (or for which a third-party parser
	 * has been plugged in) and it's dependencies. Events are dispatched when assets are encountered
	 * and for when the resource (or it's dependencies) have been loaded.
	 *
	 * The AssetLoader will not make assets available in any other way than through the dispatched
	 * events. To store assets and make them available at any point from any module in an application,
	 * use the AssetLibrary to load and manage assets.
	 *
	 * @see away.library.AssetLibrary
	 */
	export class AssetLoader extends away.events.EventDispatcher
	{
		private _context:AssetLoaderContext;
		private _token:AssetLoaderToken;
		private _uri:string;
		private _content:away.base.DisplayObject;
		private _materialMode:number;
		
		private _errorHandlers:Array<Function>;
		private _parseErrorHandlers:Array<Function>;

		private _stack:Array<away.parsers.ResourceDependency>;
		private _baseDependency:away.parsers.ResourceDependency;
		private _currentDependency:away.parsers.ResourceDependency;
		private _namespace:string;
		
		private _onReadyForDependenciesDelegate:Function;
		private _onParseCompleteDelegate:Function;
		private _onParseErrorDelegate:Function;
		private _onLoadCompleteDelegate:Function;
		private _onLoadErrorDelegate:Function;
		private _onTextureSizeErrorDelegate:Function;
		private _onAssetCompleteDelegate:Function;

		// Image parser only parser that is added by default, to save file size.
		private static _parsers:Array<any> = new Array<any>(away.parsers.BitmapParser, away.parsers.Texture2DParser, away.parsers.CubeTextureParser);

		/**
		 * Enables a specific parser.
		 * When no specific parser is set for a loading/parsing opperation,
		 * loader3d can autoselect the correct parser to use.
		 * A parser must have been enabled, to be considered when autoselecting the parser.
		 *
		 * @param parser The parser class to enable.
		 *
		 * @see away.parsers.Parsers
		 */
		public static enableParser(parser)
		{
			if (AssetLoader._parsers.indexOf(parser) < 0)
				AssetLoader._parsers.push(parser);
		}

		/**
		 * Enables a list of parsers.
		 * When no specific parser is set for a loading/parsing opperation,
		 * AssetLoader can autoselect the correct parser to use.
		 * A parser must have been enabled, to be considered when autoselecting the parser.
		 *
		 * @param parsers A Vector of parser classes to enable.
		 * @see away.parsers.Parsers
		 */
		public static enableParsers(parsers:Array<Object>)
		{
			for (var c:number = 0; c < parsers.length; c++)
				AssetLoader.enableParser(parsers[ c ]);
		}

		/**
		 * Returns the base dependency of the loader
		 */
		public get baseDependency():away.parsers.ResourceDependency
		{
			return this._baseDependency;
		}

		/**
		 * Create a new ResourceLoadSession object.
		 */
		constructor(materialMode:number = 0)
		{
			super();

			this._materialMode = materialMode;

			this._stack = new Array<away.parsers.ResourceDependency>();
			this._errorHandlers = new Array<Function>();
			this._parseErrorHandlers = new Array<Function>();

			this._onReadyForDependenciesDelegate = away.utils.Delegate.create(this, this.onReadyForDependencies);
			this._onParseCompleteDelegate = away.utils.Delegate.create(this, this.onParseComplete);
			this._onParseErrorDelegate = away.utils.Delegate.create(this, this.onParseError);
			this._onLoadCompleteDelegate = away.utils.Delegate.create(this, this.onLoadComplete);
			this._onLoadErrorDelegate = away.utils.Delegate.create(this, this.onLoadError);
			this._onTextureSizeErrorDelegate = away.utils.Delegate.create(this, this.onTextureSizeError);
			this._onAssetCompleteDelegate = away.utils.Delegate.create(this, this.onAssetComplete);
		}

		/**
		 * Loads a file and (optionally) all of its dependencies.
		 *
		 * @param req The URLRequest object containing the URL of the file to be loaded.
		 * @param context An optional context object providing additional parameters for loading
		 * @param ns An optional namespace string under which the file is to be loaded, allowing the differentiation of two resources with identical assets
		 * @param parser An optional parser object for translating the loaded data into a usable resource. If not provided, AssetLoader will attempt to auto-detect the file type.
		 */
		public load(req:URLRequest, context:AssetLoaderContext = null, ns:string = null, parser:away.parsers.ParserBase = null):AssetLoaderToken
		{
			if (!this._token) {
				this._token = new AssetLoaderToken(this);

				this._uri = req.url = req.url.replace(/\\/g, "/");
				this._context = context;
				this._namespace = ns;

				this._baseDependency = new away.parsers.ResourceDependency('', req, null, parser, null);
				this.retrieveDependency(this._baseDependency);

				return this._token;
			}

			// TODO: Throw error (already loading)
			return null;
		}

		/**
		 * Loads a resource from already loaded data.
		 *
		 * @param data The data object containing all resource information.
		 * @param context An optional context object providing additional parameters for loading
		 * @param ns An optional namespace string under which the file is to be loaded, allowing the differentiation of two resources with identical assets
		 * @param parser An optional parser object for translating the loaded data into a usable resource. If not provided, AssetLoader will attempt to auto-detect the file type.
		 */
		public loadData(data:any, id:string, context:AssetLoaderContext = null, ns:string = null, parser:away.parsers.ParserBase = null):AssetLoaderToken
		{
			if (!this._token) {
				this._token = new AssetLoaderToken(this);

				this._uri = id;
				this._context = context;
				this._namespace = ns;

				this._baseDependency = new away.parsers.ResourceDependency(id, null, data, parser, null);
				this.retrieveDependency(this._baseDependency);

				return this._token;
			}

			// TODO: Throw error (already loading)
			return null;
		}

		/**
		 * Recursively retrieves the next to-be-loaded and parsed dependency on the stack, or pops the list off the
		 * stack when complete and continues on the top set.
		 * @param parser The parser that will translate the data into a usable resource.
		 */
		private retrieveNext(parser:away.parsers.ParserBase = null)
		{
			if (this._currentDependency.dependencies.length) {

				var next:away.parsers.ResourceDependency = this._currentDependency.dependencies.pop();

				this._stack.push(this._currentDependency);
				this.retrieveDependency(next);

			} else if (this._currentDependency.parser && this._currentDependency.parser.parsingPaused) {

				this._currentDependency.parser._iResumeParsingAfterDependencies();
				this._stack.pop();

			} else if (this._stack.length) {

				var prev:away.parsers.ResourceDependency = this._currentDependency;

				this._currentDependency = this._stack.pop();

				if (prev._iSuccess)
					prev.resolve();

				this.retrieveNext(parser);

			} else {
				this.dispatchEvent(new away.events.LoaderEvent(away.events.LoaderEvent.RESOURCE_COMPLETE, this._uri, this._baseDependency.parser.content, this._baseDependency.assets));
			}
		}

		/**
		 * Retrieves a single dependency.
		 * @param parser The parser that will translate the data into a usable resource.
		 */
		private retrieveDependency(dependency:away.parsers.ResourceDependency)
		{
			var data:any;

			if (this._context && this._context.materialMode != 0)
				this._materialMode = this._context.materialMode;

			this._currentDependency = dependency;

			dependency._iLoader = new URLLoader();

			this.addEventListeners(dependency._iLoader);

			// Get already loaded (or mapped) data if available
			data = dependency.data;

			if (this._context && dependency.request && this._context._iHasDataForUrl(dependency.request.url))
				data = this._context._iGetDataForUrl(dependency.request.url);

			if (data) {
				if (data.constructor === Function)
					data = new data();

				dependency._iSetData(data);

				if (dependency.retrieveAsRawData) {
					// No need to parse. The parent parser is expecting this
					// to be raw data so it can be passed directly.
					dependency.resolve();

					// Move on to next dependency
					this.retrieveNext();

				} else {
					this.parseDependency(dependency);
				}

			} else {
				// Resolve URL and start loading
				dependency.request.url = this.resolveDependencyUrl(dependency);

				if (dependency.retrieveAsRawData) {
					// Always use binary for raw data loading
					dependency._iLoader.dataFormat = URLLoaderDataFormat.BINARY;
				} else {

					if (!dependency.parser)
						dependency._iSetParser(this.getParserFromSuffix(dependency.request.url));

					if (dependency.parser) {
						dependency._iLoader.dataFormat = dependency.parser.dataFormat;
					} else {
						// Always use BINARY for unknown file formats. The thorough
						// file type check will determine format after load, and if
						// binary, a text load will have broken the file data.
						dependency._iLoader.dataFormat = URLLoaderDataFormat.BINARY;
					}
				}

				dependency._iLoader.load(dependency.request);
			}
		}

		private joinUrl(base:string, end:string):string
		{
			if (end.charAt(0) == '/')
				end = end.substr(1);

			if (base.length == 0)
				return end;

			if (base.charAt(base.length - 1) == '/')
				base = base.substr(0, base.length - 1);

			return base.concat('/', end);

		}

		private resolveDependencyUrl(dependency:away.parsers.ResourceDependency):string
		{
			var scheme_re:RegExp;
			var base:string;
			var url:string = dependency.request.url;

			// Has the user re-mapped this URL?
			if (this._context && this._context._iHasMappingForUrl(url))
				return this._context._iGetRemappedUrl(url);

			// This is the "base" dependency, i.e. the actual requested asset.
			// We will not try to resolve this since the user can probably be
			// thrusted to know this URL better than our automatic resolver. :)
			if (url == this._uri)
				return url;


			// Absolute URL? Check if starts with slash or a URL
			// scheme definition (e.g. ftp://, http://, file://)
			scheme_re = new RegExp('/^[a-zA-Z]{3,4}:\/\//');

			if (url.charAt(0) == '/') {
				if (this._context && this._context.overrideAbsolutePaths)
					return this.joinUrl(this._context.dependencyBaseUrl, url); else
					return url;
			} else if (scheme_re.test(url)) {
				// If overriding full URLs, get rid of scheme (e.g. "http://")
				// and replace with the dependencyBaseUrl defined by user.
				if (this._context && this._context.overrideFullURLs) {
					var noscheme_url:string;

					noscheme_url = url['replace'](scheme_re);

					return this.joinUrl(this._context.dependencyBaseUrl, noscheme_url);
				}
			}

			// Since not absolute, just get rid of base file name to find it's
			// folder and then concatenate dynamic URL
			if (this._context && this._context.dependencyBaseUrl) {
				base = this._context.dependencyBaseUrl;
				return this.joinUrl(base, url);
			} else {
				base = this._uri.substring(0, this._uri.lastIndexOf('/') + 1);
				return this.joinUrl(base, url);
			}
		}

		private retrieveParserDependencies()
		{
			if (!this._currentDependency)
				return;

			var parserDependancies = this._currentDependency.parser.dependencies
			var i:number, len:number = parserDependancies.length;

			for (i = 0; i < len; i++)
				this._currentDependency.dependencies[i] = parserDependancies[i];


			// Since more dependencies might be added eventually, empty this
			// list so that the same dependency isn't retrieved more than once.
			parserDependancies.length = 0;

			this._stack.push(this._currentDependency);

			this.retrieveNext();
		}

		private resolveParserDependencies()
		{
			this._currentDependency._iSuccess = true;

			// Retrieve any last dependencies remaining on this parser, or
			// if none exists, just move on.
			if (this._currentDependency.parser && this._currentDependency.parser.dependencies.length && (!this._context || this._context.includeDependencies))//context may be null
				this.retrieveParserDependencies();
			else
				this.retrieveNext();
		}

		/**
		 * Called when a single dependency loading failed, and pushes further dependencies onto the stack.
		 * @param event
		 */
		private onLoadError(event:away.events.IOErrorEvent)
		{
			var handled:boolean;
			var isDependency:boolean = (this._currentDependency != this._baseDependency);
			var loader:URLLoader = <URLLoader> event.target;//TODO: keep on eye on this one

			this.removeEventListeners(loader);

			if (this.hasEventListener( away.events.IOErrorEvent.IO_ERROR )) {
				this.dispatchEvent(event);
				handled = true;
			} else {
				// TODO: Consider not doing this even when AssetLoader does have it's own LOAD_ERROR listener
				var i:number, len:number = this._errorHandlers.length;
				for (i = 0; i < len; i++)
					if (!handled)
						handled = <boolean> this._errorHandlers[i](event);
			}

			if (handled) {

				//if (isDependency && ! event.isDefaultPrevented()) {
				if (isDependency) { // TODO: JS / AS3 Change - we don't have isDefaultPrevented - so will this work

					this._currentDependency.resolveFailure();
					this.retrieveNext();

				} else {
					// Either this was the base file (last left in the stack) or
					// default behavior was prevented by the handlers, and hence
					// there is nothing more to do than clean up and bail.
					this.dispose();
					return;
				}
			} else {

				// Error event was not handled by listeners directly on AssetLoader or
				// on any of the subscribed loaders (in the list of error handlers.)
				throw new away.errors.Error();
			}
		}

		/**
		 * Called when a dependency parsing failed, and dispatches a <code>ParserEvent.PARSE_ERROR</code>
		 * @param event
		 */
		private onParseError(event:away.events.ParserEvent)
		{
			var handled:boolean;

			var isDependency:boolean = (this._currentDependency != this._baseDependency);

			var loader:URLLoader = <URLLoader>event.target;

			this.removeEventListeners(loader);

			if (this.hasEventListener(away.events.ParserEvent.PARSE_ERROR)) {
				this.dispatchEvent(event);
				handled = true;
			} else {
				// TODO: Consider not doing this even when AssetLoader does
				// have it's own LOAD_ERROR listener
				var i:number, len:number = this._parseErrorHandlers.length;

				for (i = 0; i < len; i++)
					if (!handled)
						handled = <boolean> this._parseErrorHandlers[i](event);
			}

			if (handled) {
				this.dispose();
				return;
			} else {
				// Error event was not handled by listeners directly on AssetLoader or
				// on any of the subscribed loaders (in the list of error handlers.)
				throw new away.errors.Error(event.message);
			}
		}

		private onAssetComplete(event:away.events.AssetEvent)
		{
			// Add loaded asset to list of assets retrieved as part
			// of the current dependency. This list will be inspected
			// by the parent parser when dependency is resolved
			if (this._currentDependency)
				this._currentDependency.assets.push(event.asset);

			event.asset.resetAssetPath(event.asset.name, this._namespace);

			if (!this._currentDependency.suppresAssetEvents)
				this.dispatchEvent(event);
		}

		private onReadyForDependencies(event:away.events.ParserEvent)
		{
			var parser:away.parsers.ParserBase = <away.parsers.ParserBase> event.target;

			if (this._context && !this._context.includeDependencies)
				parser._iResumeParsingAfterDependencies();
			else
				this.retrieveParserDependencies();
		}

		/**
		 * Called when a single dependency was parsed, and pushes further dependencies onto the stack.
		 * @param event
		 */
		private onLoadComplete(event:away.events.Event)
		{
			var loader:URLLoader = <URLLoader> event.target;

			this.removeEventListeners(loader);

			// Resolve this dependency
			this._currentDependency._iSetData(loader.data);

			if (this._currentDependency.retrieveAsRawData) {
				// No need to parse this data, which should be returned as is
				this.resolveParserDependencies();
			} else {
				this.parseDependency(this._currentDependency);
			}
		}

		/**
		 * Called when parsing is complete.
		 */
		private onParseComplete(event:away.events.ParserEvent):void
		{
			var parser:away.parsers.ParserBase = <away.parsers.ParserBase> event.target;

			this.resolveParserDependencies();//resolve in front of removing listeners to allow any remaining asset events to propagate

			parser.removeEventListener(away.events.ParserEvent.READY_FOR_DEPENDENCIES, this._onReadyForDependenciesDelegate);
			parser.removeEventListener(away.events.ParserEvent.PARSE_COMPLETE, this._onParseCompleteDelegate);
			parser.removeEventListener(away.events.ParserEvent.PARSE_ERROR, this._onParseErrorDelegate);
			parser.removeEventListener(away.events.AssetEvent.TEXTURE_SIZE_ERROR, this._onTextureSizeErrorDelegate);
			parser.removeEventListener(away.events.AssetEvent.ASSET_COMPLETE, this._onAssetCompleteDelegate);
		}

		/**
		 * Called when an image is too large or it's dimensions are not a power of 2
		 * @param event
		 */
		private onTextureSizeError(event:away.events.AssetEvent)
		{
			event.asset.name = this._currentDependency.resolveName(event.asset);

			this.dispatchEvent(event);
		}

		private addEventListeners(loader:URLLoader)
		{
			loader.addEventListener(away.events.Event.COMPLETE, this._onLoadCompleteDelegate);
			loader.addEventListener(away.events.IOErrorEvent.IO_ERROR, this._onLoadErrorDelegate);
		}

		private removeEventListeners(loader:URLLoader)
		{
			loader.removeEventListener(away.events.Event.COMPLETE, this._onLoadCompleteDelegate);
			loader.removeEventListener(away.events.IOErrorEvent.IO_ERROR, this._onLoadErrorDelegate);
		}

		public stop()
		{
			this.dispose();
		}

		private dispose()
		{
			this._errorHandlers = null;
			this._parseErrorHandlers = null;
			this._context = null;
			this._token = null;
			this._stack = null;

			if (this._currentDependency && this._currentDependency._iLoader)
				this.removeEventListeners(this._currentDependency._iLoader);

			this._currentDependency = null;

		}

		/**
		 * @private
		 * This method is used by other loader classes (e.g. Loader3D and AssetLibraryBundle) to
		 * add error event listeners to the AssetLoader instance. This system is used instead of
		 * the regular EventDispatcher system so that the AssetLibrary error handler can be sure
		 * that if hasEventListener() returns true, it's client code that's listening for the
		 * event. Secondly, functions added as error handler through this custom method are
		 * expected to return a boolean value indicating whether the event was handled (i.e.
		 * whether they in turn had any client code listening for the event.) If no handlers
		 * return true, the AssetLoader knows that the event wasn't handled and will throw an RTE.
		 */

		public _iAddParseErrorHandler(handler)
		{
			if (this._parseErrorHandlers.indexOf(handler) < 0)
				this._parseErrorHandlers.push(handler);
		}

		public _iAddErrorHandler(handler)
		{
			if (this._errorHandlers.indexOf(handler) < 0)
				this._errorHandlers.push(handler);
		}


		/**
		 * Guesses the parser to be used based on the file contents.
		 * @param data The data to be parsed.
		 * @param uri The url or id of the object to be parsed.
		 * @return An instance of the guessed parser.
		 */
		private getParserFromData(data:any):away.parsers.ParserBase
		{
			var len:number = AssetLoader._parsers.length;

			// go in reverse order to allow application override of default parser added in away.proper
			for (var i:number = len - 1; i >= 0; i--)
				if (AssetLoader._parsers[i].supportsData(data))
					return new AssetLoader._parsers[i]();

			return null;
		}


		/**
		 * Initiates parsing of the loaded dependency.
		 * 
		 * @param The dependency to be parsed.
		 */
		private parseDependency(dependency:away.parsers.ResourceDependency):void
		{
			var parser:away.parsers.ParserBase = dependency.parser;
			
			// If no parser has been defined, try to find one by letting
			// all plugged in parsers inspect the actual data.
			if (!parser)
				dependency._iSetParser(parser = this.getParserFromData(dependency.data));

			if (parser) {
				parser.addEventListener(away.events.ParserEvent.READY_FOR_DEPENDENCIES, this._onReadyForDependenciesDelegate);
				parser.addEventListener(away.events.ParserEvent.PARSE_COMPLETE, this._onParseCompleteDelegate);
				parser.addEventListener(away.events.ParserEvent.PARSE_ERROR, this._onParseErrorDelegate);
				parser.addEventListener(away.events.AssetEvent.TEXTURE_SIZE_ERROR, this._onTextureSizeErrorDelegate);
				parser.addEventListener(away.events.AssetEvent.ASSET_COMPLETE, this._onAssetCompleteDelegate);

				if (dependency.request && dependency.request.url)
					parser._iFileName = dependency.request.url;

				parser.materialMode = this._materialMode;

				parser.parseAsync(dependency.data);

			} else {
				var message:string = "No parser defined. To enable all parsers for auto-detection, use Parsers.enableAllBundled()"
				if(this.hasEventListener(away.events.ParserEvent.PARSE_ERROR))
					this.dispatchEvent(new away.events.ParserEvent(away.events.ParserEvent.PARSE_ERROR, message));
				else
					throw new Error(message);
			}
		}

		/**
		 * Guesses the parser to be used based on the file extension.
		 * @return An instance of the guessed parser.
		 */
		private getParserFromSuffix(url:string):away.parsers.ParserBase
		{
			// Get rid of query string if any and extract extension
			var base:string = (url.indexOf('?') > 0)? url.split('?')[0] : url;
			var fileExtension:string = base.substr(base.lastIndexOf('.') + 1).toLowerCase();

			var len:number = AssetLoader._parsers.length;

			// go in reverse order to allow application override of default parser added in away.proper
			for (var i:number = len - 1; i >= 0; i--) {
				var parserClass:any = AssetLoader._parsers[i];
				if (parserClass.supportsType(fileExtension))
					return new parserClass();
			}

			return null;
		}
	}
}