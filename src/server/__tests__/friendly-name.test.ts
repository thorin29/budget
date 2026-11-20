import { describe, expect, it } from "vitest";
import { friendlyName } from "../net-worth";

describe("friendlyName", () => {
  it("cleans feed names", () => {
    expect(friendlyName("Joint Tenant ...366 (366)")).toBe("Joint Tenant ··366");
    expect(friendlyName("Staked ETH (c750187b-64f9-51c0-887f-7f7ac11aaaaa)")).toBe("Staked ETH");
    expect(friendlyName("Example Staffing 401(k) Plan Acme Managed")).toBe("401(k)");
    expect(friendlyName("Investment Mix for Thrift Savings Plan Uniformed Services")).toBe("Thrift Savings Plan");
    expect(friendlyName("Bills Checking - 1401 (1401)")).toBe("Bills Checking ··1401");
    expect(friendlyName("Money Market Savings - 6494 (6494)")).toBe("Money Market Savings ··6494");
    expect(friendlyName("Checking")).toBe("Checking");
  });
});
