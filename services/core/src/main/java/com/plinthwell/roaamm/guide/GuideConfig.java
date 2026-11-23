package com.plinthwell.roaamm.guide;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(GuideProperties.class)
public class GuideConfig {}
