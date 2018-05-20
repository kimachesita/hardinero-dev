const Gpio = require('pigpio').Gpio;
const dht = require('pigpio-dht');
const socket = require('socket.io-client')('http://msuiit-hardinero.herokuapp.com');

const SNR_TRIGGER = 27,
    SNR_ECHO = 22,
    DHT22_TYPE = 22,
    DHT22_DATA = 17,
    SOIL_PROBE1 = 23,
    SOIL_PROBE2 = 24,
    RLY_SW1 = 5,
    RLY_SW2 = 6,
    MICROSECDONDS_PER_CM = 1e6 / 34321,
    REPORT_RATE = 5000,
    DEVICE_KEY = process.env.DEVKEY || 'def123';

//parameter variables
let parameters = {
    device_key: DEVICE_KEY,
    cropMoistureLimit: 0,
    cropHumidityLimit: 0,
    cropWateringFrequency: 0
}

//sensor variables
// initialize values

let data = {
    weather: 'No Data',
    temperature: 0,
    humidity: 0,
    waterMoisture1: 0,
    waterMoisture2: 0,
    waterPumpOn: 0,
    tankLevel: 0,
    lastWatering: 'No Data',
    device_key: parameters.device_key
}

let connected = false;

let gpios = {
    snr_trigger: null,
    snr_echo: null,
    dht22_data: null,
    soil_prb1: null,
    soil_prb2: null,
    rly_sw1: null,
    rly_sw2: null
}

function configurePins() {
    //configure pins
    gpios.snr_trigger = new Gpio(SNR_TRIGGER, { mode: Gpio.OUTPUT });
    gpios.snr_trigger.digitalWrite(0); //make sure trigger is low
    gpios.snr_echo = new Gpio(SNR_ECHO, { mode: Gpio.INPUT, alert: true });
    gpios.dht22_data = dht(DHT22_DATA, DHT22_TYPE);
    gpios.soil_prb1 = new Gpio(SOIL_PROBE1, { mode: Gpio.INPUT, edge: Gpio.EITHER_EDGE });
    gpios.soil_prb2 = new Gpio(SOIL_PROBE2, { mode: Gpio.INPUT, edge: Gpio.EITHER_EDGE });
    gpios.rly_sw1 = new Gpio(RLY_SW1, { mode: Gpio.OUTPUT, pullUpDown: Gpio.PUD_DOWN });
    gpios.rly_sw2 = new Gpio(RLY_SW2, { mode: Gpio.OUTPUT, pullUpDown: Gpio.PUD_DOWN });
}


function configureSocket() {
    socket.on('connect', function () {
        console.log(`Socket: Connected to server`);
        connected = true;

        socket.on('overwrite', function (data) {
            if (parameters.device_key == data.device_key) {
                console.log('Overwriting Parameters...');
                parameters.cropHumidityLimit = data.cropHumidityLimit;
                parameters.cropMoistureLimit = data.cropMoistureLimit;
                parameters.cropWateringFrequency = data.cropWateringFrequency;
                console.log('Done overwriting parameters....');
                console.log(parameters);
            }
        })

    });

    socket.on('connect_error', function () {
        console.log(`Socket: Cannot connect to server`);
    });

    socket.on('disconnect', function (reason) {
        console.log(`Socket: Disconnected <${reason}>`);
        connected = false;
    });

    socket.on('overwrite', function (data) {
        if (data.device_key == DEVICE_KEY) {
            console.log(`Configuration Change: ${data}`);
        }
    });
}

function setup() {
    configurePins();
    configureSocket();

    // sonar operations
    let startTick;

    gpios.snr_echo.on('alert', function (level, tick) {
        let endTick, diff;
        if (level == 1) {
            startTick = tick;
        } else {
            endTick = tick;
            diff = (endTick >> 0) - (startTick >> 0); // Unsigned 32 bit arithmetic
            data.tankLevel = diff / 2 / MICROSECDONDS_PER_CM;
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
    gpios.soil_prb1.on('interrupt', (level) => {
        data.waterMoisture1 = !level;
    });


    gpios.soil_prb2.on('interrupt', (level) => {
        data.waterMoisture2 = !level;
    });

    //relay operations
    /* let temp = 0;

    setInterval(function(){
        temp = !temp;
        gpios.rly_sw1.digitalWrite(temp);
        gpios.rly_sw2.digitalWrite(!temp);
    },1000); */

    // reporting
    setInterval(function () {
        console.log(`Distance: ${data.distance}`);
        console.log(`temp: ${data.temperature}°c`);
        console.log(`rhum: ${data.humidity}%`);
        console.log(`Soil Bed 1: ${data.soil1_wet}`);
        console.log(`Soil Bed 2: ${data.soil2_wet}`);
        if (connected) {
            //updateDummyData();
            socket.emit('report', data);
            console.log('Data Reported to server');
        }

    }, REPORT_RATE);

}

// for testing purposes
/* function updateDummyData(){
    data.weather = 'No Data';
    data.temperature++;
    data.humidity++;
    data.waterMoisture1++;
    data.waterMoisture2++;
    data.waterPumpOn = !data.waterPumpOn;
    data.tankLevel++;
    data.lastWatering = 'No Data'
} */


//begin main routine
setup();
