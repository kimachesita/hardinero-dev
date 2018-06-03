const Gpio = require('pigpio').Gpio;
const dht = require('pigpio-dht');
const Raspi = require('raspi');
const I2C = require('raspi-i2c').I2C;
const ADS1x15 = require('raspi-kit-ads1x15');

//configure socket
const socket = require('socket.io-client')('http://msuiit-hardinero.herokuapp.com');


//pin definitions
const SNR_TRIGGER = 27,
    SNR_ECHO = 22,
    DHT22_TYPE = 22,
    DHT22_DATA = 17,
    //SOIL_PROBE1 = 23,
    //SOIL_PROBE2 = 24,
    RLY_SW1 = 5,
    RLY_SW2 = 6,
    MICROSECDONDS_PER_CM = 1e6 / 34321, //speed of sound
    SENSOR_CHECK_RATE = 1000, //ms how often to check parameter conditions
    REPORT_RATE = 5000, //ms
    DEVICE_KEY = process.env.DEVKEY || 'hardinero',
    //calibration values
    DISTANCE_MAX = 43, //sonar value d where tank is empty, change according to calibration
    DISTANCE_MIN = 5,   //sonar value d where tank is full, change according to calibration
    MOISTURE_MAX = 24000, //moisture max value, (when dry), change according to calibration
    MOISTURE_MIN = 12000, //moisture min value,  (when wet) change according to calibration
    SLENGTH = 120; // number of seconds to activate pump if wateringFrequency condition met

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
    soilMoisture1: 0,
    soilMoisture2: 0,
    waterPumpOn: false,
    tankLevel: 0,
    lastWatering: 'No Data',
    device_key: parameters.device_key
}

//utility variables
let connected = false;
let w_seconds_past = 0;
let w_activated = false;

let gpios = {
    snr_trigger: null,
    snr_echo: null,
    dht22_data: null,
    //soil_prb1: null,
    //soil_prb2: null,
    rly_sw1: null,
    rly_sw2: null
}

function configurePins() {
    //configure pins
    gpios.snr_trigger = new Gpio(SNR_TRIGGER, { mode: Gpio.OUTPUT });
    gpios.snr_trigger.digitalWrite(0); //make sure trigger is low
    gpios.snr_echo = new Gpio(SNR_ECHO, { mode: Gpio.INPUT, alert: true });
    gpios.dht22_data = dht(DHT22_DATA, DHT22_TYPE);
    //gpios.soil_prb1 = new Gpio(SOIL_PROBE1, { mode: Gpio.INPUT, edge: Gpio.EITHER_EDGE });
    //gpios.soil_prb2 = new Gpio(SOIL_PROBE2, { mode: Gpio.INPUT, edge: Gpio.EITHER_EDGE });
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

    /* socket.on('overwrite', function (data) {
        if (data.device_key == DEVICE_KEY) {
            console.log(`Configuration Change: ${data}`);
        }
    }); */
}

function configureRaspi() {
    // Init Raspi
    Raspi.init(() => {

        // Init Raspi-I2c
        const i2c = new I2C();

        // Init the ADC
        const adc = new ADS1x15({
            i2c,                                    // i2c interface
            chip: ADS1x15.chips.IC_ADS1115,         // chip model
            address: ADS1x15.address.ADDRESS_0x48,  // i2c address on the bus

            // Defaults for future readings
            pga: ADS1x15.pga.PGA_4_096V,            // power-gain-amplifier range
            sps: ADS1x15.spsADS1015.SPS_250         // data rate (samples per second)
        });

        setInterval(function () {
            // Get a single-ended reading from channel-0 and display the results
            adc.readChannel(ADS1x15.channel.CHANNEL_2, (err, value, volts) => {
                if (err) {
                    console.error('Failed to fetch value from ADC CH2', err);
                } else {
                    if(value > MOISTURE_MAX){
                        value = MOISTURE_MAX;
                    }else if( value < MOISTURE_MIN){
                        value = MOISTURE_MIN;
                    }
                    data.soilMoisture1 = (1 - ((value - MOISTURE_MIN)/(MOISTURE_MAX-MOISTURE_MIN)))*100;
                }
            });

            adc.readChannel(ADS1x15.channel.CHANNEL_3, (err, value, volts) => {
                if (err) {
                    console.error('Failed to fetch value from ADC CH3', err);
                } else {
                    if(value > MOISTURE_MAX){
                        value = MOISTURE_MAX;
                    }else if( value < MOISTURE_MIN){
                        value = MOISTURE_MIN;
                    }
                    data.soilMoisture2 = (1 - ((value - MOISTURE_MIN)/(MOISTURE_MAX-MOISTURE_MIN)))*100;
                }
            });
        }, 1000);

    });
}

function activatePump() {
    let now = new Date();
    if (!data.waterPumpOn) {
        data.waterPumpOn = true;
        gpios.rly_sw1.digitalWrite(1);
        gpios.rly_sw2.digitalWrite(1);
        let now = new Date();
        data.lastWatering = (now.getMonth() + 1) + "/" + now.getDate() + '/' + now.getYear()
            + ' ' + now.getHours() + '-' + (now.getMinutes()) + '-' + (now.getSeconds());
    }
}

function deactivatePump() {
    data.waterPumpOn = false;
    gpios.rly_sw1.digitalWrite(0);
    gpios.rly_sw2.digitalWrite(0);
}

function setup() {
    configurePins();
    configureSocket();
    configureRaspi();

    // sonar operations
    let startTick;

    gpios.snr_echo.on('alert', function (level, tick) {
        let endTick, diff, distance;
        if (level == 1) {
            startTick = tick;
        } else {
            endTick = tick;
            diff = (endTick >> 0) - (startTick >> 0); // Unsigned 32 bit arithmetic
            distance = diff / 2 / MICROSECDONDS_PER_CM; //get distance based on the speed of sound
            //data.tankLevel = ((TANK_LEVEL_CAL - distance) / TANK_LEVEL_CAL) * 100; //get remaing tank level in %
            if( distance > DISTANCE_MAX){
                distance = DISTANCE_MAX;
            }else if(distance < DISTANCE_MIN){
                distance = DISTANCE_MIN;
            }
            data.tankLevel = 100*(distance - DISTANCE_MAX)/(DISTANCE_MAX - DISTANCE_MIN);
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
        data.soilMoisture1 = !level; //for digital implementation for now... change if ADC will be used
    });


    gpios.soil_prb2.on('interrupt', (level) => {
        data.soilMoisture2 = !level; //for digital implementation for now... change if ADC will be used
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
        console.log(`Distance: ${data.tankLevel}`);
        console.log(`temp: ${data.temperature}°c`);
        console.log(`rhum: ${data.humidity}%`);
        console.log(`Soil Bed 1: ${data.soilMoisture1}`);
        console.log(`Soil Bed 2: ${data.soilMoisture2}`);
        if (connected) {
            //updateDummyData();
            socket.emit('report', data);
            console.log('Data Reported to server');
        }

    }, REPORT_RATE);

    //auto watering routine
    setInterval(function () {

        let n = new Date();
        let h = n.getHours();
        let m = n.getMinutes();
        let wfactor = 721;
        if(parameters.cropWateringFrequency == 1){
            wfactor = 721;
        }
        wfactor = Math.floor( 720 / (parameters.cropWateringFrequency - 1));


        if (parameters.cropMoistureLimit > 0 &&
            (data.soilMoisture1 < parameters.cropMoistureLimit ||
                (data.soilMoisture2 < parameters.cropMoistureLimit))) {
            //water moisture in critical levels
            activatePump();
        } else if (parameters.cropHumidityLimit > 0 &&
            data.humidity < parameters.cropHumidityLimit) {
            //atmosphere humidity in critical level
            activatePump();
        } else if (parameters.cropWateringFrequency > 0) {
            //watering frequency valid only from 6->18 (6am to 6pm)
            if (12 <= h && h <= 24) {
                let min_from_zero = ((h - 12) * 60 + m);
                if ((min_from_zero % wfactor) == 0 && w_activated == false) {
                    w_activated = true;
                    activatePump();
                }
                if (w_activated) {
                    w_seconds_past++;
                    if (w_seconds_past == SLENGTH) {
                        w_seconds_past = 0;
                        w_activated = false;
                        deactivatePump();
                    }
                }
            }
        } else {
            deactivatePump();
        }
    }, SENSOR_CHECK_RATE);

}


//begin main routine
setup();
