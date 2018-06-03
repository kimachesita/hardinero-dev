const Gpio = require('pigpio').Gpio;
const dht = require('pigpio-dht');
const Raspi = require('raspi');
const I2C = require('raspi-i2c').I2C;
const ADS1x15 = require('raspi-kit-ads1x15');

//configure socket
//const socket = require('socket.io-client')('http://msuiit-hardinero.herokuapp.com');


//pin definitions and some 
const SNR_TRIGGER = 27, //pin 13
    SNR_ECHO = 22,      //pin 15
    DHT22_TYPE = 22,    
    DHT22_DATA = 17,    //pin 11
    //SOIL_PROBE1 = 23,
    //SOIL_PROBE2 = 24,
    RLY_SW1 = 5,        //pin 29
    RLY_SW2 = 6,        //pin 31
    MICROSECONDS_PER_CM = 1e6 / 34321, //speed of sound
    SENSOR_CHECK_RATE = 1000, //ms how often to check parameter conditions
    REPORT_RATE = 2000, //ms
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
    soilMoistureCorrected1 = 0,
    soilMoisture2: 0,
    soilMoistureCorrected2 = 0,
    waterPumpOn: false,
    tankLevel: 0,
    tankLevelCorrected: 0,
    lastWatering: 'No Data',
    device_key: parameters.device_key
}


let gpios = {
    snr_trigger: null,
    snr_echo: null,
    dht22_data: null,
    rly_sw1: null,
    rly_sw2: null
}

function configurePins() {
    //configure pins
    gpios.snr_trigger = new Gpio(SNR_TRIGGER, { mode: Gpio.OUTPUT });
    gpios.snr_trigger.digitalWrite(0); //make sure trigger is low
    gpios.snr_echo = new Gpio(SNR_ECHO, { mode: Gpio.INPUT, alert: true });
    gpios.dht22_data = dht(DHT22_DATA, DHT22_TYPE);
    gpios.rly_sw1 = new Gpio(RLY_SW1, { mode: Gpio.OUTPUT, pullUpDown: Gpio.PUD_DOWN });
    gpios.rly_sw2 = new Gpio(RLY_SW2, { mode: Gpio.OUTPUT, pullUpDown: Gpio.PUD_DOWN });
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
                    console.error('Failed to fetch value from ADC CH0', err);
                } else {
                    data.soilMoisture1 = value;
                    if(value > MOISTURE_MAX){
                        value = MOISTURE_MAX;
                    }else if( value < MOISTURE_MIN){
                        value = MOISTURE_MIN;
                    }
                    data.soilMoistureCorrected1 = (1 - ((value - MOISTURE_MIN)/(MOISTURE_MAX-MOISTURE_MIN)))*100;
                }
            });

            adc.readChannel(ADS1x15.channel.CHANNEL_3, (err, value, volts) => {
                if (err) {
                    console.error('Failed to fetch value from ADC CH1', err);
                } else {
                    data.soilMoisture2 = value;
                    if(value > MOISTURE_MAX){
                        value = MOISTURE_MAX;
                    }else if( value < MOISTURE_MIN){
                        value = MOISTURE_MIN;
                    }
                    data.soilMoistureCorrected2 = (1 - ((value - MOISTURE_MIN)/(MOISTURE_MAX-MOISTURE_MIN)))*100;
                    
                }
            });
        }, 1000);

    });
}



function setup() {
    configurePins();
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
            distance = diff / 2 / MICROSECONDS_PER_CM; //get distance based on the speed of sound
            data.tankLevel = distance;
            if( distance > DISTANCE_MAX){
                distance = DISTANCE_MAX;
            }else if(distance < DISTANCE_MIN){
                distance = DISTANCE_MIN;
            }
            data.tankLevelCorrected = 100*(distance - DISTANCE_MAX)/(DISTANCE_MAX - DISTANCE_MIN);
            
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



    //relay operations
    let temp = 0;

    setInterval(function(){
        temp = !temp;
        gpios.rly_sw1.digitalWrite(temp);
        gpios.rly_sw2.digitalWrite(!temp);
    },1000);

    // reporting
    setInterval(function () {
        console.log(`Distance: ${data.tankLevel}`);
        console.log(`TankLevel: ${data.tankLevelCorrected}`); 
        console.log(`temp: ${data.temperature}°c`);
        console.log(`rhum: ${data.humidity}%`);
        console.log(`Soil Bed 1: ${data.soilMoisture1}`);
        console.log(`Soil Bed 1 %: ${data.soilMoistureCorrected1}`);
        console.log(`Soil Bed 2: ${data.soilMoisture2}`);
        console.log(`Soil Bed 2 %: ${data.soilMoistureCorrected2}`);
    }, REPORT_RATE);

}


//begin main routine
setup();
