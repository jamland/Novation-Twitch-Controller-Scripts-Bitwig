loadAPI(1);

var twitch = null;

host.defineController("Novation", "Twitch", "1.0", "436dec90-dfbc-11e3-8b68-0800200c9a66");
host.defineMidiPorts(1, 1);
host.addDeviceNameBasedDiscoveryPair (["Twitch"], ["Twitch"]);
host.addDeviceNameBasedDiscoveryPair (["Novation Twitch"], ["Novation Twitch"]);


var LOWEST_CC = 2;
var HIGHEST_CC = 119;

var CC =
{
	REW  : 84,
	LOOP : 85,
	FF   : 86,
	STOP : 117,
	PLAY : 23,
	REC  : 22,
	TEMPO: 3,
};

// channels for knobs
var CHANNEL = {
	A: 		183,
	B: 		184,
	C: 		185,
	D: 		186,
	FX: 	187,
	TREE: 183
};

// channels for buttons
var BTN_CHANNEL = {
	A: 				151,
	B: 				152,
	C: 				153,
	D: 				154,
	FX: 			155,
	BROWSER: 	151,
	BRWS_DECK:151,
	LOAD_A:  	151,
	LOAD_B:   151,
	LOAD_C: 	153,
	LOAD_D:   153
}

var isShift = false;
var isPlay = false;
var isRec = false;


// a variable to hold a key-translation array:
var padTranslation = initArray(0, 128);

// a variable to hold the offset from the default:
var padShift = 0;

// a function to shift the array up or down by a certain offset
// numbers outside the MIDI keyrange are set to -1 which mutes them.
function setNoteTable(table, offset) {
  for (var i = 0; i < 128; i++)
   {
      if ((i%8)<=3) {
      	table[i] = offset + i;
			} else {
				// set rows in usual order for drum machines. like this:
				// 5 6 7 8
				// 1 2 3 4
      	table[i] = offset + i -8;
			}

      if (table[i] < 0 || table[i] > 127) {
         table[i] = -1;
         
      }
   }

  // here I set the KeyTranslationTable of the note input the the updated array:
  twitchPads.setKeyTranslationTable(padTranslation);

}

function init()
{
	host.getMidiInPort(0).createNoteInput("Twitch", "000000");
	host.getMidiInPort(0).setMidiCallback(onMidi);
	
	twitchPads = host.getMidiInPort(0).createNoteInput("Twitch Pads", "976???", "977???", "986???", "987???");
	twitchPads.setShouldConsumeEvents(false);

	setNoteTable(padTranslation, -56);
	

	transport = host.createTransportSection();
	trackBank = host.createTrackBankSection(8, 0, 8);

	cursorTrack = host.createCursorTrackSection(2, 0);
	cursorDevice = cursorTrack.getPrimaryInstrument();

	masterTrack = host.createMasterTrack(2);

	application = host.createApplicationSection();

	host.showPopupNotification('Twitch Initialized!');

	transport.addIsPlayingObserver(function(on)
	{
		isPlay = on;
	});

	transport.addIsRecordingObserver(function(on) {
		isRec = on;
	});

	   // Add an observer which prints volume of the cursor track with 128 steps to the console
	cursorTrack.getVolume().addValueObserver(128, function(value) {
		println("VOLUME : " + value); 
	});

	// update left VUmeter
	masterTrack.addVuMeterObserver (128, 0, true, function (value) {
   		LEDToggle(151, 95, value);
   		LEDToggle(153, 95, value);
	});

	// update left VUmeter
	masterTrack.addVuMeterObserver (128, 1, true, function (value) {
   		LEDToggle(152, 95, value);
   		LEDToggle(154, 95, value);
	});


	// Make CCs 2-119 freely mappable
	userControls = host.createUserControlsSection(HIGHEST_CC - LOWEST_CC + 1);

	for(var i=LOWEST_CC; i<=HIGHEST_CC; i++)
	{
	  userControls.getControl(i - LOWEST_CC).setLabel("CC" + i);
	}   		
	println ("Initialized!");
}

function exit()
{
}

function onMidi(status, data1, data2) {
	var cc = data1;
	var val = data2;
	var pressed = val > 0;
	
	// this block process knobs
	if (isChannelController(status)) {
	  if (data1 >= LOWEST_CC && data1 <= HIGHEST_CC)
	  {
	    var index = data1 - LOWEST_CC;
	    userControls.getControl(index).set(data2, 128);
	    
	    var scene = -1;

	    if (status == CHANNEL.B && val > 0) {
        switch (cc) {
            case CC.TEMPO:
            	if(val<=64) {
              	transport.increaseTempo(1,647);
            	}
            	else {
              	transport.increaseTempo(-1,647);
            	}
              break;
        }
	    }
	  }
	// otherwise it might be a button
	} else {
		if(status==BTN_CHANNEL.A) {
			if(pressed) {
				switch (cc) {
					case CC.REW:
						transport.rewind();
						break;
					case CC.FF:
						transport.fastForward();
						break;
					case CC.LOOP:
						transport.toggleLoop();
						break;
				}
			}
		}
		if(status==BTN_CHANNEL.B) {
			if(pressed) {
				switch (cc) {
					case CC.PLAY:
						transport.play();
						isPlay ? LEDToggle(status, cc, 0) : LEDToggle(status, cc, 127);
						break;
					case CC.REC:
						transport.record();
						isRec ? LEDToggle(status, cc, 0) : LEDToggle(status, cc, 15);
						break;
				}
			}
		}

		// check which row pad (1-4 / 5-6)
		var isFirstPadRow  = null;
		var isSecondPadRow = null;
		// if first (1-4)
		if ((cc >= 96 && cc <= 99) 
			|| (cc >= 104 && cc <= 107)
			|| (cc >= 112 && cc <= 115) 
			|| (cc >= 120 && cc <= 123)) {
				isFirstPadRow = true;
		} 
		// if second (5-8)
		else if ((cc >= 100 && cc <= 103) 
			|| (cc >= 108 && cc <= 111)
			|| (cc >= 116 && cc <= 119) 
			|| (cc >= 124 && cc <= 127)) {
				isSecondPadRow = true;
		}

		var is_AorB_Deck = null;
		if (status == BTN_CHANNEL.A || status == BTN_CHANNEL.B) {
			is_AorB_Deck = true;
		}

		// flash pads' backlights
		if (is_AorB_Deck && cc>=96 && cc<=127) {
			switch (val) {
				case 127:
					LEDToggle(status, cc, 127)
					break;
				case 0:
					LEDToggle(status, cc, 0);
					break;
			}
		}

	}

	printMidi(status, data1, data2);
}

function LEDToggle(status, cc, val){
	host.getMidiOutPort(0).sendMidi(status, cc, val);
}


