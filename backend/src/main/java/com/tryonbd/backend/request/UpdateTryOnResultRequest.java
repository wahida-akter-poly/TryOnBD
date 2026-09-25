package com.tryonbd.backend.request;

import jakarta.validation.constraints.NotBlank;

public class UpdateTryOnResultRequest {

    @NotBlank
    private String resultImageUrl;

    public String getResultImageUrl() {
        return resultImageUrl;
    }

    public void setResultImageUrl(String resultImageUrl) {
        this.resultImageUrl = resultImageUrl;
    }
}
