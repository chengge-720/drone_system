package com.drone.system.domain;
import lombok.Data;

@Data
public class SubmitPwdBody {
    private String oldPassword;
    private String newPassword;
    private String confirmPassword;
}
