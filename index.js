const Gpio = require('pigpio').Gpio;
const dht = require('pigpio-dht');
const socket = require('socket.io-client')('http://192.168.137.1:3000');

const SNR_TRIGGER = 27,
    SNR_ECHO = 22,
    DHT22_TYPE = 22,
    DHT22_DATA = 17,
    SOIL_PROBE1 = 23,
    SOIL_PROBE2 = 24,
    RLY_SW1 = 5,
    RLY_SW2 = 6,
    MICROSECDONDS_PER_CM = 1e6/34321,
    REPORT_RATE = 2000,
    DEVICE_KEY = 'rampul';

//sensor variables
let data = {
    distance: 0,
    temperature: 0,
    humidity: 0,
    soil1_wet : 0,
    soil2_wet : 0,
    rly_sw1 : 0,
    rly_sw2 : 0,
    desired_moisture: 0
}

let gpios = {
    snr_trigger : null,
    snr_echo : null,
    dht22_data : null,
    soil_prb1 : null,
    soil_prb2 : null,
    rly_sw1 : null,
    rly_sw2 : null
}

function configurePins(){
    //configure pins
    gpios.snr_trigger = new Gpio(SNR_TRIGGER, {mode: Gpio.OUTPUT});
    gpios.snr_trigger.digitalWrite(0); //make sure trigger is low
    gpios.snr_echo = new Gpio(SNR_ECHO, {mode: Gpio.INPUT, alert: true});
    gpios.dht22_data = dht(DHT22_DATA, DHT22_TYPE);
    gpios.soil_prb1 = new Gpio(SOIL_PROBE1,{mode: Gpio.INPUT,edge: Gpio.EITHER_EDGE});
    gpios.soil_prb2 = new Gpio(SOIL_PROBE2,{mode: Gpio.INPUT,edge: Gpio.EITHER_EDGE});
    gpios.rly_sw1 = new Gpio(RLY_SW1,{mode: Gpio.OUTPUT,pullUpDown: Gpio.PUD_DOWN});
    gpios.rly_sw2 = new Gpio(RLY_SW2,{mode: Gpio.OUTPUT,pullUpDown: Gpio.PUD_DOWN});
}


function configureSocket(){
    socket.on('connect', function(){
        console.log(`Socket: Connected to a server`);      
    });
    
    socket.on('connect_error', function(){
        console.log(`Socket: Cannot connect to server`);
    });

    socket.on('disconnect', function(reason){
        console.log(`Socket: Disconnected <${reason}>`);
    });

    socket.on('updt_desired_moisture',function(client_key,moisture){
        if(DEVICE_KEY == client_key){
            data.desired_moisture = moisture;
            console.log(`Desired moisture changed to ${data.desired_moisture}`);
        }
    });
}

function setup(){
    configurePins();
    configureSocket();

    // sonar operations
    let startTick;

    gpios.snr_echo.on('alert', function (level, tick) {
        let endTick,diff;
        if (level == 1) {
          startTick = tick;
        } else {
          endTick = tick;
          diff = (endTick >> 0) - (startTick >> 0); // Unsigned 32 bit arithmetic
          data.distance = diff / 2 / MICROSECDONDS_PER_CM;
        }
    })

    setInterval(function () {
        gpios.snr_trigger.trigger(10, 1); // Set trigger high for 10 microseconds
    }, 1000);

    //dht22 operations
    setInterval(() => { 
        gpios.dht22_data.read();
    }, 2500); // the sensor can only be red every 2 seconds
     
    gpios.dht22_data.on('result', raw => {
        data.temperature = raw.temperature;
        data.humidity = raw.humidity;
    });
     
    gpios.dht22_data.on('badChecksum', () => {
        console.log('dht22_error_badChecksum');
    });

    //soil moisture operation
    gpios.soil_prb1.on('interrupt',(level)=>{
        data.soil1_wet = !level;
    });

    
    gpios.soil_prb2.on('interrupt',(level)=>{
        data.soil2_wet = !level;
    });

    //relay operations
    let temp = 0;

    setInterval(function(){
        temp = !temp;
        gpios.rly_sw1.digitalWrite(temp);
        gpios.rly_sw2.digitalWrite(!temp);
    },1000);

    // reporting
    setInterval(function(){
        console.log(`Distance: ${data.distance}`);
        console.log(`temp: ${data.temperature}°c`); 
        console.log(`rhum: ${data.humidity}%`); 
        console.log(`Soil Bed 1: ${data.soil1_wet}`);
        console.log(`Soil Bed 2: ${data.soil2_wet}`);
        socket.emit('report',DEVICE_KEY,data);
    },REPORT_RATE);

}

setup();
