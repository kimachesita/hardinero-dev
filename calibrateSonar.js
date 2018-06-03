const Gpio = require('pigpio').Gpio;
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const SNR_TRIGGER = 27, //pin 13
    SNR_ECHO = 22;      //pin 15

//storage area
forMax = [];
forMin = [];
currentState = 0; // initialiaze to find max state
counter = 0;

function configurePin(){
    gpios.snr_trigger = new Gpio(SNR_TRIGGER, { mode: Gpio.OUTPUT });
    gpios.snr_trigger.digitalWrite(0); //make sure trigger is low
    gpios.snr_echo = new Gpio(SNR_ECHO, { mode: Gpio.INPUT, alert: true });
}


function setup(){
    configurePin();
     // sonar operations
    let startTick;

    gpios.snr_echo.on('alert', function (level, tick) {
        let endTick, diff, distance;
        if (level == 1) {
            startTick = tick;
        } else {
            endTick = tick;
            diff = (endTick >> 0) - (startTick >> 0); // Unsigned 32 bit arithmetic
            distance = diff / 2 / MICROSECONDS_PER_CM; //get distance based on the speed of sound
            
            /* if( distance > DISTANCE_MAX){
                distance = DISTANCE_MAX;
            }else if(distance < DISTANCE_MIN){
                distance = DISTANCE_MIN;
            } */
            //data.tankLevel = 100*(distance - DISTANCE_MAX)/(DISTANCE_MAX - DISTANCE_MIN);
            //data.tankLevel = distance;
            if(currentState == 1){
                forMax.push(distance);
            }else if(currentState == 2){
                forMin.push(distance);
            }
        }
    });

    rl.question('Finding DISTANCE_MAX. Setup your device to get value. Hit enter to proceed...',(answer) => {
        
    })


    setInterval(function () {
        gpios.snr_trigger.trigger(10, 1); // Set trigger high for 10 microseconds
        
    }, 10);

}
