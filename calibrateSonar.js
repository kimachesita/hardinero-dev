const Gpio = require('pigpio').Gpio;

const SNR_TRIGGER = 27, //pin 13
    SNR_ECHO = 22;      //pin 15

function configurePin(){
    gpios.snr_trigger = new Gpio(SNR_TRIGGER, { mode: Gpio.OUTPUT });
    gpios.snr_trigger.digitalWrite(0); //make sure trigger is low
    gpios.snr_echo = new Gpio(SNR_ECHO, { mode: Gpio.INPUT, alert: true });
}