import { Module } from '@nestjs/common';
import { GMailAPI } from './apis/gmail-api';
import { OutlookAPI } from './apis/outlook-api';
import { UnipileAPI } from './apis/unipile-api';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [ HttpModule.register({
    timeout: 5000, 
    maxRedirects: 5,
  })],
  providers: [GMailAPI, OutlookAPI, UnipileAPI],
  exports: [GMailAPI, OutlookAPI, UnipileAPI],
})
export class PlugModule { }
