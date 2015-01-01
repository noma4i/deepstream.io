var proxyquire = require( 'proxyquire' ),
	RecordRequestMock = require( '../mocks/record-request-mock' ),
	RecordTransition = proxyquire( '../../src/record/record-transition', { './record-request': RecordRequestMock } ),
	SocketWrapper = require( '../../src/message/socket-wrapper' ),
	SocketMock = require( '../mocks/socket-mock' ),
	StorageMock = require( '../mocks/storage-mock' );

describe( 'record transition happy path', function(){
	var recordTransition,
		socketWrapper = new SocketWrapper( new SocketMock() ),
		patchMessage = { topic: 'RECORD', action: 'P', data: [ 'someRecord', 1, 'firstname', 'SEgon' ] },
		recordHandlerMock = { _$broadcastUpdate: jasmine.createSpy(), _$transitionComplete: jasmine.createSpy() },
		options = { cache: new StorageMock(), storage: new StorageMock() }; 

	it( 'creates the transition', function(){
		recordTransition = new RecordTransition( 'someRecord', options, recordHandlerMock );
		expect( recordTransition.hasVersion ).toBeDefined();
		expect( recordTransition.hasVersion( 2 ) ).toBe( false );
	});

	it( 'adds a patch to the queue', function(){
		expect( recordTransition._recordRequest ).toBe( null );
		recordTransition.add( socketWrapper, 1, patchMessage );
		expect( recordTransition._recordRequest ).toBeDefined();
		expect( recordTransition._recordRequest.recordName ).toBe( 'someRecord' );
	});

	it( 'retrieves the empty record', function(){
		expect( recordHandlerMock._$broadcastUpdate ).not.toHaveBeenCalled();
		expect( recordHandlerMock._$transitionComplete ).not.toHaveBeenCalled();
		recordTransition._recordRequest.onComplete({ _v: 0, _d: {} });
		expect( recordHandlerMock._$broadcastUpdate ).toHaveBeenCalledWith( 'someRecord', patchMessage, socketWrapper );
		expect( recordHandlerMock._$transitionComplete ).toHaveBeenCalledWith( 'someRecord' );
	});
});

describe( 'record transition multiple steps', function(){
	var recordTransition,
		socketWrapper = new SocketWrapper( new SocketMock() ),
		patchMessage = { topic: 'RECORD', action: 'P', data: [ 'someRecord', 1, 'firstname', 'SEgon' ] },
		patchMessage2 = { topic: 'RECORD', action: 'P', data: [ 'someRecord', 3, 'firstname', 'SLana' ] },
		updateMessage = { topic: 'RECORD', action: 'U', data: [ 'someRecord', 2, '{ "lastname": "Peterson" }' ] },
		recordHandlerMock = { 
			_$broadcastUpdate: jasmine.createSpy( '_$broadcastUpdate' ), 
			_$transitionComplete: jasmine.createSpy( '_$transitionComplete' ) },
		options = { cache: new StorageMock(), storage: new StorageMock() }; 

	options.cache.nextOperationWillBeSynchronous = false;

	it( 'creates the transition', function(){
		recordTransition = new RecordTransition( 'someRecord', options, recordHandlerMock );
		expect( recordTransition._record ).toBe( null );
		expect( recordTransition.hasVersion ).toBeDefined();
		expect( recordTransition.hasVersion( 2 ) ).toBe( false );
	});

	it( 'adds a patch to the queue', function(){
		expect( recordTransition._recordRequest ).toBe( null );
		recordTransition.add( socketWrapper, 1, patchMessage );
		expect( recordTransition._recordRequest ).toBeDefined();
		expect( recordTransition._recordRequest.recordName ).toBe( 'someRecord' );
		expect( recordTransition._record ).toBe( null );
	});

	it( 'adds an update to the queue', function(){
		expect( recordTransition._steps.length ).toBe( 1 );
		recordTransition.add( socketWrapper, 2, updateMessage );
		expect( recordTransition._steps.length ).toBe( 2 );
	});

	it( 'retrieves the empty record', function( done ){
		expect( recordHandlerMock._$broadcastUpdate ).not.toHaveBeenCalled();
		expect( recordHandlerMock._$transitionComplete ).not.toHaveBeenCalled();
		expect( recordTransition._steps.length ).toBe( 2 );
		expect( recordTransition._record ).toBe( null );
		recordTransition._recordRequest.onComplete({ _v: 0, _d: { lastname: 'Kowalski' } });
		expect( recordTransition._record ).toEqual({ _v: 1, _d: { firstname: 'Egon', lastname: 'Kowalski' } });
		expect( options.cache.completedSetOperations ).toBe( 0 );
		var check = setInterval(function(){
			if( options.cache.completedSetOperations === 1 ) {
				expect( recordHandlerMock._$broadcastUpdate ).toHaveBeenCalledWith( 'someRecord', patchMessage, socketWrapper );
				expect( recordHandlerMock._$transitionComplete ).not.toHaveBeenCalled();
				expect( recordTransition._record ).toEqual({ _v: 2, _d: { lastname: 'Peterson' } });
				clearInterval( check );
				done();
			}
		}, 1 );
	});

	it( 'receives a patch message whilst the transition is in progress', function(){
		expect( recordHandlerMock._$transitionComplete ).not.toHaveBeenCalled();
		recordTransition.add( socketWrapper, 3, patchMessage2 );
	});  

	it( 'returns hasVersion for 1,2 and 3', function(){
		expect( recordTransition.hasVersion( 0 ) ).toBe( true );
		expect( recordTransition.hasVersion( 1 ) ).toBe( true );
		expect( recordTransition.hasVersion( 2 ) ).toBe( true );
		expect( recordTransition.hasVersion( 3 ) ).toBe( true );
		expect( recordTransition.hasVersion( 4 ) ).toBe( false );
		expect( recordTransition.hasVersion( 5 ) ).toBe( false );
	});

	it( 'processes the next step in the queue', function( done ){
		var check = setInterval(function(){
			if( options.cache.completedSetOperations === 2 ) {
				expect( recordHandlerMock._$broadcastUpdate ).toHaveBeenCalledWith( 'someRecord', updateMessage, socketWrapper );
				expect( recordHandlerMock._$transitionComplete ).not.toHaveBeenCalled();
				expect( recordTransition._record ).toEqual({ _v: 3, _d: { firstname: 'Lana', lastname: 'Peterson' } });
				clearInterval( check );
				done();
			}
		}, 1 );
	});

	it( 'processes the final step in the queue', function( done ){
		var check = setInterval(function(){
			if( options.cache.completedSetOperations === 3 ) {
				expect( recordHandlerMock._$broadcastUpdate ).toHaveBeenCalledWith( 'someRecord', patchMessage2, socketWrapper );
				expect( recordHandlerMock._$transitionComplete ).toHaveBeenCalled();
				clearInterval( check );
				done();
			}
		}, 1 );
	});
});